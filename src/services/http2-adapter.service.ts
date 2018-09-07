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

  public findAll2<T extends JsonApiModel>(options: FindAllOptions<T>): Observable<JsonApiQueryData<T>> {
    const relationshipNames = options.includes
                                     .split(',')
                                     .filter((relationshipName: string) => relationshipName);

    const filteredRelationshipNames = this.filterUnecessaryIncludes(relationshipNames);

    // TODO: X-Push-Related: parent relationships from filteredRelationshipNames
    // ie. [profileNames.info, consumer.nesto] ===> profileNames,consumer

    const topXPushRelated = filteredRelationshipNames.map((relationshipName) => relationshipName.split('.')[0]);
    options.requestHeaders.set('X-Push-Related', topXPushRelated.join(','));

    return this.http.get(options.requestUrl, { headers: options.requestHeaders })
      .map((response: any) => {
        const models = this.generateModels(response, response.data, options.modelType);
        return new JsonApiQueryData(models, this.parseMeta(response, options.modelType));
      })
      .map((queryData: JsonApiQueryData<T>) => {
        const models: Array<T> = queryData.getModels();
        models.forEach((model: T) => {
          this.addToStore(model);

          filteredRelationshipNames.forEach((complexRelationshipName: string) => {
            const relationshipName = complexRelationshipName.split('.')[0];
            const deeperRelationshipNames = complexRelationshipName.split('.').splice(1);

            if (
              model.data.relationships &&
              model.data.relationships[relationshipName] &&
              model.data.relationships[relationshipName].links &&
              model.data.relationships[relationshipName].links.related
            ) {
              const relationshipUrl = model.data.relationships[relationshipName].links.related;

              const topXPushRelated = deeperRelationshipNames.map((relationshipName) => relationshipName.split('.')[0]);
              options.requestHeaders.set('X-Push-Related', topXPushRelated.join(','));

              this.http.get(relationshipUrl, { headers: options.requestHeaders })
                .map((response: any) => {
                  debugger
                  // const models = this.generateModels(response, response.data, options.modelType);
                  // return new JsonApiQueryData(models, this.parseMeta(response, options.modelType));
                });
            }
          });
        });

        return queryData;
      });
      // TODO: .catch((res: any) => this.handleError(res));
  }

  private generateModels<T extends JsonApiModel>(body: any, modelsData: Array<any>, modelType: ModelType<T>): Array<T> {
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

  // private handleQueryRelationships<T extends JsonApiModel>(
  //   body: any,
  //   modelType: ModelType<T>,
  //   withMeta = false,
  //   relationshipNames: Array<string> = [],
  //   requestHeaders: HttpHeaders
  // ) {
  //   const models: Array<T> = [];

  //   this.generateModels(body.data, modelType).forEach((model: T) => {
  //     relationshipNames.forEach((relationshipName: string) => {
  //       const relationShipParts = relationshipName.split('.');
  //       const parentRelationshipName = relationShipParts[0];

  //       if (data.relationships &&
  //         data.relationships[parentRelationshipName] &&
  //         data.relationships[parentRelationshipName].links &&
  //         data.relationships[parentRelationshipName].links.related
  //       ) {
  //         const relationshipUrl = data.relationships[parentRelationshipName].links.related;
  //         const deepRelationshipName: Array<string> = relationShipParts.splice(1);

  //         this.http
  //             .get(relationshipUrl, { headers: requestHeaders })
  //             .map((res: any) => this.fetchRelationships(res, modelType, false, deepRelationshipName))
  //             // TODO: .catch((res: any) => this.handleError(res))
  //             .subscribe();
  //       }

  //       // Make a reqest
  //       // Napravi model iz responsea
  //       // Zalijepi response na "model"
  //       // idi dublje i radi isto
  //     });
  //   });

  //   if (withMeta && withMeta === true) {
  //     return new JsonApiQueryData(models, this.parseMeta(body, modelType));
  //   }

  //   return models;
  // }

  private fetchRelationships<T extends JsonApiModel>(
    originalModel: T,
    body: any,
    modelType: ModelType<T>,
    withMeta = false,
    relationshipNames: Array<string> = []
  ) {
    debugger;
  }

  protected abstract generateModel<T extends JsonApiModel>(
    modelData: any,
    modelType: ModelType<T>
  ): T;

  protected abstract parseMeta(body: any, modelType: ModelType<JsonApiModel>): any;
  public abstract addToStore(modelOrModels: JsonApiModel | JsonApiModel[]): void;
}
