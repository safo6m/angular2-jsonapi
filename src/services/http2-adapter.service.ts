import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { JsonApiQueryData } from './../models/json-api-query-data';
import { ModelType } from './json-api-datastore.service';
import { JsonApiModel } from './../models/json-api.model';
import { Observable, ReplaySubject, combineLatest } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { removeDuplicates } from '../helpers/remove-duplicates.helper';

export interface FindAllOptions<T extends JsonApiModel> {
  includes: string;
  modelType: ModelType<T>;
  requestOptions: RequestOptions;
  requestUrl: string;
}

export interface FindRecordOptions<T extends JsonApiModel> {
  includes: string;
  modelType: ModelType<T>;
  requestOptions: RequestOptions;
  requestUrl: string;
}

export interface RequestOptions {
  headers: HttpHeaders;
  [key: string]: object;
}

interface Http2RequestOptions<T extends JsonApiModel> {
  requestUrl: string;
  requestOptions: RequestOptions;
  relationshipNames: Array<string>;
  parentModel?: T;
  parentRelationshipName?: string;
  modelType?: ModelType<T>; // modelType must be present for the initial call
}

export abstract class Http2AdapterService {
  constructor(protected http: HttpClient) {}

  public findRecord2<T extends JsonApiModel>(options: FindRecordOptions<T>): Observable<T> {
    const relationshipNames = options.includes
                                     .split(',')
                                     .filter((relationshipName: string) => relationshipName);

    const filteredRelationshipNames = this.filterUnecessaryIncludes(relationshipNames);

    return this.makeHttp2Request({
      requestUrl: options.requestUrl,
      requestOptions: options.requestOptions,
      relationshipNames: filteredRelationshipNames,
      modelType: options.modelType
    }).pipe(
      catchError((res: any) => this.handleError(res))
    );
  }

  public findAll2<T extends JsonApiModel>(options: FindAllOptions<T>): Observable<JsonApiQueryData<T>> {
    const relationshipNames = options.includes
                                     .split(',')
                                     .filter((relationshipName: string) => relationshipName);

    const filteredRelationshipNames = this.filterUnecessaryIncludes(relationshipNames);

    return this.makeHttp2Request({
      requestUrl: options.requestUrl,
      requestOptions: options.requestOptions,
      relationshipNames: filteredRelationshipNames,
      modelType: options.modelType
    }).pipe(
      catchError((res: any) => this.handleError(res))
    );
  }

  private makeHttp2Request<T extends JsonApiModel>(
    requestOptions: Http2RequestOptions<T>
  ): Observable<JsonApiQueryData<T> | Array<T> | T> {
    const results: ReplaySubject<JsonApiQueryData<T> | Array<T> | T> =
      new ReplaySubject<JsonApiQueryData<T> | Array<T> | T>();

    const requests$: Array<Observable<any>> = [];

    let topXPushRelated = requestOptions.relationshipNames.map((relationshipName: string) => {
      return relationshipName.split('.')[0];
    });
    topXPushRelated = removeDuplicates(topXPushRelated);

    let headers = requestOptions.requestOptions.headers;

    if (topXPushRelated.length) {
      headers = headers.set('X-Push-Related', topXPushRelated.join(','));
    } else {
      headers = headers.delete('X-Push-Related');
    }

    const httpRequestOptions = Object.assign({}, requestOptions.requestOptions, { headers, observe: 'response' });

    const mainRequest$ = this.http.get(requestOptions.requestUrl, httpRequestOptions).pipe(
      map((response: HttpResponse<object>) => {
        const requestBody: { data: any } = response.body as { data: any };

        if (this.isMultipleModelsFetched(requestBody)) {
          // tslint:disable-next-line:max-line-length
          const modelType = requestOptions.modelType || (requestBody.data[0] ? this.getModelClassFromType(requestBody.data[0].type) : null);
          const models = modelType ? this.generateModels(requestBody.data, modelType) : [];
          // tslint:disable-next-line:max-line-length
          return requestOptions.modelType ? new JsonApiQueryData(models, this.parseMeta(requestBody, requestOptions.modelType)) : models;
        } else {
          const modelType = this.getModelClassFromType(requestBody.data.type);
          const relationshipModel = this.generateModel(requestBody.data, modelType);

          this.addToStore(relationshipModel);

          if (requestOptions.parentModel && requestOptions.parentRelationshipName) {
            requestOptions.parentModel[requestOptions.parentRelationshipName] = relationshipModel;
          }

          return relationshipModel;
        }
      }),
      map((queryData: JsonApiQueryData<T> | Array<T> | T) => {
        if (queryData instanceof JsonApiQueryData || Array.isArray(queryData)) {
          const models: Array<T> = queryData instanceof JsonApiQueryData ? queryData.getModels() : queryData;

          models.forEach((model: T) => {
            this.addToStore(model);
            const request$ = this.handleIncludedRelationships(
              requestOptions.relationshipNames,
              model,
              headers
            );

            requests$.push(request$);
          });
        } else {
          const request$ = this.handleIncludedRelationships(
            requestOptions.relationshipNames,
            queryData,
            headers
          );

          requests$.push(request$);
        }

        return queryData;
      }),
      map((queryData: JsonApiQueryData<T> | Array<T> | T) => {
        if (!requests$.length) {
          results.next(queryData);
        } else {
          combineLatest(...requests$).subscribe(() => {
            results.next(queryData);
          });
        }

        return queryData;
      })
    );

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

        const requestOptions: RequestOptions = {
          headers: requestHeaders
        };

        const request$ = this.makeHttp2Request({
          requestOptions,
          requestUrl: relationshipUrl,
          relationshipNames: deeperRelationshipNames,
          parentModel: model,
          parentRelationshipName: relationshipName
        });

        requests$.push(request$);
      }
    });

    if (!requests$.length) {
      results.next(false);
    } else {
      combineLatest(...requests$).subscribe(() => {
        results.next(false);
      });
    }

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

  private isMultipleModelsFetched(requestBody: any): boolean {
    return Array.isArray(requestBody.data);
  }

  protected abstract generateModel<T extends JsonApiModel>(
    modelData: any,
    modelType: ModelType<T>
  ): T;

  protected abstract parseMeta(body: any, modelType: ModelType<JsonApiModel>): any;
  public abstract addToStore(modelOrModels: JsonApiModel | JsonApiModel[]): void;
  protected abstract getModelClassFromType<T extends JsonApiModel>(modelType: string): ModelType<T>;
  protected abstract handleError(error: any): Observable<any>;
}
