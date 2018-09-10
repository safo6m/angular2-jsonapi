import { HttpClient, HttpHeaders } from '@angular/common/http';
import { JsonApiQueryData } from './../models/json-api-query-data';
import { ModelType } from './json-api-datastore.service';
import { JsonApiModel } from './../models/json-api.model';
import { Observable } from 'rxjs/Observable';

export interface FindAllOptions<T extends JsonApiModel> {
  includes: string;
  modelType: ModelType<T>;
  requestHeaders: HttpHeaders;
  requestUrl: string;
}

export abstract class Http2AdapterService {
  constructor(protected http: HttpClient) {}

  public findAll2<T extends JsonApiModel>(options: FindAllOptions<T>): Observable<JsonApiQueryData<T> | T> {
    const relationshipNames = options.includes
                                     .split(',')
                                     .filter((relationshipName: string) => relationshipName);

    const filteredRelationshipNames = this.filterUnecessaryIncludes(relationshipNames);

    return this.makeHttp2Request(
      options.requestUrl,
      options.requestHeaders,
      filteredRelationshipNames
    );
    // TODO: .catch((res: any) => this.handleError(res));
  }

  private makeHttp2Request<T extends JsonApiModel>(
    requestUrl: string,
    requestHeaders: HttpHeaders,
    relationshipNames: Array<string>,
    parentModel?: T,
    parentRelationshipName?: string
  ) {
    const topXPushRelated = relationshipNames.map((relationshipName: string) => relationshipName.split('.')[0]);
    // TODO: removeDuplicates from topXPushRelated
    requestHeaders.set('X-Push-Related', topXPushRelated.join(','));

    return this.http.get(requestUrl, { headers: requestHeaders })
      .map((response: any) => {
        if (this.isMultipleModelsFetched(response.data)) {
          // This can happen if there is no items in data
          // const modelType = response.data[0] ? this.getModelClassFromType(response.data[0].type) : null;
          const modelType = this.getModelClassFromType(response.data[0].type);


          const models = modelType ? this.generateModels(response.data, modelType) : [];
          return new JsonApiQueryData(models, this.parseMeta(response, modelType));
        } else {
          const modelType = this.getModelClassFromType(response.data.type);
          const relationshipModel = this.generateModel(response.data, modelType);

          this.addToStore(relationshipModel);

          if (parentModel && parentRelationshipName) {
            parentModel[parentRelationshipName] = relationshipModel;
          }

          return relationshipModel;
        }
      })
      .map((queryData: JsonApiQueryData<T> | T) => {
        if (queryData instanceof JsonApiQueryData) {
          const models: Array<T> = queryData.getModels();
          models.forEach((model: T) => {
            this.addToStore(model);
            this.handleIncludedRelationships(relationshipNames, model, requestHeaders);
          });
        } else {
          this.handleIncludedRelationships(relationshipNames, queryData, requestHeaders);
        }

        return queryData;
      });
  }

  private handleIncludedRelationships<T extends JsonApiModel>(
    relationshipNames: Array<string>,
    model: T,
    requestHeaders: HttpHeaders
  ) {
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

        this.makeHttp2Request(
          relationshipUrl,
          requestHeaders,
          deeperRelationshipNames,
          model,
          relationshipName
        );
      }
    });
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
}
