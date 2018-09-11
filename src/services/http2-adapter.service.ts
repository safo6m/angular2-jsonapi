import { ErrorObservable } from 'rxjs/observable/ErrorObservable';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { JsonApiQueryData } from './../models/json-api-query-data';
import { ModelType } from './json-api-datastore.service';
import { JsonApiModel } from './../models/json-api.model';
import { Observable, BehaviorSubject, ReplaySubject } from 'rxjs';
import { removeDuplicates } from '../helpers/remove-duplicates.helper';
import { Subject } from 'rxjs/Subject';

export interface FindAllOptions<T extends JsonApiModel> {
  includes: string;
  modelType: ModelType<T>;
  requestHeaders: HttpHeaders;
  requestUrl: string;
}

interface Http2RequestOptions<T extends JsonApiModel> {
  requestUrl: string;
  requestHeaders: HttpHeaders;
  relationshipNames: Array<string>;
  parentModel?: T;
  parentRelationshipName?: string;
  modelType?: ModelType<T>; // modelType must be present for the initial call
}

export abstract class Http2AdapterService {
  constructor(protected http: HttpClient) {}

  public findAll2<T extends JsonApiModel>(options: FindAllOptions<T>): Observable<JsonApiQueryData<T>> {
    const relationshipNames = options.includes
                                     .split(',')
                                     .filter((relationshipName: string) => relationshipName);

    const filteredRelationshipNames = this.filterUnecessaryIncludes(relationshipNames);

    return this.makeHttp2Request({
      requestUrl: options.requestUrl,
      requestHeaders: options.requestHeaders,
      relationshipNames: filteredRelationshipNames,
      modelType: options.modelType
    })
    .catch((res: any) => this.handleError(res)) as Observable<JsonApiQueryData<T>>;
  }

  private makeHttp2Request<T extends JsonApiModel>(
    requestOptions: Http2RequestOptions<T>
  ): Observable<JsonApiQueryData<T> | Array<T> | T> {
    const results: Subject<JsonApiQueryData<T> | Array<T> | T> = new Subject<JsonApiQueryData<T> | Array<T> | T>();
    const requests$: Array<Observable<any>> = [];

    let topXPushRelated = requestOptions.relationshipNames.map((relationshipName: string) => {
      return relationshipName.split('.')[0];
    });
    topXPushRelated = removeDuplicates(topXPushRelated);
    requestOptions.requestHeaders.set('X-Push-Related', topXPushRelated.join(','));

    const mainRequest$ = this.http.get(requestOptions.requestUrl, { headers: requestOptions.requestHeaders })
      .map((response: any) => {
        if (this.isMultipleModelsFetched(response)) {
          // tslint:disable-next-line:max-line-length
          const modelType = requestOptions.modelType || (response.data[0] ? this.getModelClassFromType(response.data[0].type) : null);
          const models = modelType ? this.generateModels(response.data, modelType) : [];
          // tslint:disable-next-line:max-line-length
          return requestOptions.modelType ? new JsonApiQueryData(models, this.parseMeta(response, requestOptions.modelType)) : models;
        } else {
          const modelType = this.getModelClassFromType(response.data.type);
          const relationshipModel = this.generateModel(response.data, modelType);

          this.addToStore(relationshipModel);

          if (requestOptions.parentModel && requestOptions.parentRelationshipName) {
            requestOptions.parentModel[requestOptions.parentRelationshipName] = relationshipModel;
          }

          return relationshipModel;
        }
      })
      .map((queryData: JsonApiQueryData<T> | Array<T> | T) => {
        if (queryData instanceof JsonApiQueryData || Array.isArray(queryData)) {
          const models: Array<T> = queryData instanceof JsonApiQueryData ? queryData.getModels() : queryData;

          models.forEach((model: T) => {
            this.addToStore(model);
            const request$ = this.handleIncludedRelationships(
              requestOptions.relationshipNames,
              model,
              requestOptions.requestHeaders
            );

            requests$.push(request$);
          });
        } else {
          const request$ = this.handleIncludedRelationships(
            requestOptions.relationshipNames,
            queryData,
            requestOptions.requestHeaders
          );

          requests$.push(request$);
        }

        return queryData;
      }).map((queryData: JsonApiQueryData<T> | Array<T> | T) => {
        Observable.combineLatest([mainRequest$, ...requests$]).subscribe(([result]) => {
          results.next(result);
        });

        return queryData;
      }).share();

    mainRequest$.subscribe();

    return results;
  }

  private handleIncludedRelationships<T extends JsonApiModel>(
    relationshipNames: Array<string>,
    model: T,
    requestHeaders: HttpHeaders
  ): Observable<any> {
    const results: ReplaySubject<any> = new ReplaySubject<any>();
    const requests$: Array<Observable<any>> = [];

    relationshipNames.forEach((complexRelationshipName: string) => {
      const relationshipName = complexRelationshipName.split('.')[0];
      const deeperRelationshipNames = complexRelationshipName.split('.').splice(1);

      if (
        model.data.relationships &&
        model.data.relationships[relationshipName] &&
        model.data.relationships[relationshipName].links &&
        model.data.relationships[relationshipName].links.related
      ) {
        const relationshipUrl = model.data.relationships[relationshipName].links.related;

        const request$ = this.makeHttp2Request({
          requestHeaders,
          requestUrl: relationshipUrl,
          relationshipNames: deeperRelationshipNames,
          parentModel: model,
          parentRelationshipName: relationshipName
        });

        requests$.push(request$);
      }
    });

    Observable.combineLatest(requests$).subscribe(() => {
      results.next(false);
    });

    return results;
  }

  private generateModels<T extends JsonApiModel>(modelsData: Array<any>, modelType: ModelType<T>): Array<T> {
    return modelsData.map((modelData: any) => this.generateModel(modelData, modelType));
  }

  // ie. profileImage,profileImage.consumer,profileImage.consumer.info
  // ===> profileImage.consumer.info is enough
  // filter out the rest
  private filterUnecessaryIncludes(includes: Array<string>): Array<string> {
    return includes.filter((relationshipName: string) => {
      return !includes.some((name: string) => name.startsWith(`${relationshipName}.`));
    });
  }

  private isMultipleModelsFetched(response: any): boolean {
    return Array.isArray(response.data);
  }

  protected abstract generateModel<T extends JsonApiModel>(
    modelData: any,
    modelType: ModelType<T>
  ): T;

  protected abstract parseMeta(body: any, modelType: ModelType<JsonApiModel>): any;
  public abstract addToStore(modelOrModels: JsonApiModel | JsonApiModel[]): void;
  protected abstract getModelClassFromType<T extends JsonApiModel>(modelType: string): ModelType<T>;
  protected abstract handleError(error: any): ErrorObservable;
}
