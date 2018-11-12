import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import find from 'lodash-es/find';
import { map, catchError } from 'rxjs/operators';
import { throwError, of, Observable } from 'rxjs';
import { JsonApiModel } from '../models/json-api.model';
import { ErrorResponse } from '../models/error-response.model';
import { JsonApiQueryData } from '../models/json-api-query-data';
import * as qs from 'qs';
import { DatastoreConfig } from '../interfaces/datastore-config.interface';
import { ModelConfig } from '../interfaces/model-config.interface';
import { AttributeMetadata } from '../constants/symbols';
import { Http2AdapterService, FindAllOptions } from './http2-adapter.service';

export type ModelType<T extends JsonApiModel> = { new(datastore: JsonApiDatastore, data: any): T; };

/**
 * HACK/FIXME:
 * Type 'symbol' cannot be used as an index type.
 * TypeScript 2.9.x
 * See https://github.com/Microsoft/TypeScript/issues/24587.
 */
// tslint:disable-next-line:variable-name
const AttributeMetadataIndex: string = AttributeMetadata as any;

@Injectable()
export class JsonApiDatastore extends Http2AdapterService {
  private globalHeaders: HttpHeaders;
  private internalStore: {[type: string]: {[id: string]: JsonApiModel}} = {};
  private toQueryString: Function = this.datastoreConfig.overrides
    && this.datastoreConfig.overrides.toQueryString ?
      this.datastoreConfig.overrides.toQueryString : this._toQueryString;

  private get getDirtyAttributes() {
    if (this.datastoreConfig.overrides
      && this.datastoreConfig.overrides.getDirtyAttributes) {
      return this.datastoreConfig.overrides.getDirtyAttributes;
    }
    return JsonApiDatastore.getDirtyAttributes;
  }

  protected config: DatastoreConfig;

  constructor(protected http: HttpClient) {
    super(http);
  }

  public findAll<T extends JsonApiModel>(
    modelType: ModelType<T>,
    params?: any,
    headers?: HttpHeaders,
    customUrl?: string,
    http2: boolean = false
  ): Observable<JsonApiQueryData<T>> {
    const requestHeaders: HttpHeaders = this.buildHeaders(headers);
    const url: string = this.buildUrl(modelType, params, undefined, customUrl);

    if (!http2) {
      return this.http.get(url, { headers: requestHeaders })
      .pipe(
        map((res: any) => this.extractQueryData(res, modelType, true)),
        catchError((res: any) => this.handleError(res))
      );
    } else {
      const queryParams = params || {};
      const includes: string = queryParams.include || '';

      return super.findAll2({
        includes,
        modelType,
        requestHeaders,
        requestUrl: url,
      });
    }
  }

  public findRecord<T extends JsonApiModel>(
    modelType: ModelType<T>,
    id: string,
    params?: any,
    headers?: HttpHeaders,
    customUrl?: string
  ): Observable<T> {
    const requestHeaders: HttpHeaders = this.buildHeaders(headers);
    const url: string = this.buildUrl(modelType, params, id, customUrl);

    return this.http.get(url, { headers: requestHeaders, observe: 'response' })
      .pipe(
        map((res) => this.extractRecordData(res, modelType)),
        catchError((res: any) => this.handleError(res))
      );
  }

  public createRecord<T extends JsonApiModel>(modelType: ModelType<T>, data?: any): T {
    return new modelType(this, { attributes: data });
  }

  private static getDirtyAttributes(attributesMetadata: any): { string: any} {
    const dirtyData: any = {};

    for (const propertyName in attributesMetadata) {
      if (attributesMetadata.hasOwnProperty(propertyName)) {
        const metadata: any = attributesMetadata[propertyName];

        if (metadata.hasDirtyAttributes) {
          const attributeName = metadata.serializedName != null ? metadata.serializedName : propertyName;
          dirtyData[attributeName] = metadata.serialisationValue ? metadata.serialisationValue : metadata.newValue;
        }
      }
    }
    return dirtyData;
  }

  public saveRecord<T extends JsonApiModel>(
    attributesMetadata: any,
    model: T,
    params?: any,
    headers?: HttpHeaders,
    customUrl?: string
  ): Observable<T> {
    const modelType = <ModelType<T>>model.constructor;
    const modelConfig: ModelConfig = model.modelConfig;
    const typeName: string = modelConfig.type;
    const requestHeaders: HttpHeaders = this.buildHeaders(headers);
    const relationships: any = this.getRelationships(model);
    const url: string = this.buildUrl(modelType, params, model.id, customUrl);

    let httpCall: Observable<HttpResponse<Object>>;
    const body: any = {
      data: {
        relationships,
        type: typeName,
        id: model.id,
        attributes: this.getDirtyAttributes(attributesMetadata, model)
      }
    };

    if (model.id) {
      httpCall = this.http.patch(url, body, { headers: requestHeaders, observe: 'response' });
    } else {
      httpCall = this.http.post(url, body, { headers: requestHeaders, observe: 'response' });
    }

    return httpCall
      .pipe(
        map((res) => [200, 201].indexOf(res.status) !== -1 ? this.extractRecordData(res, modelType, model) : model),
        catchError((res) => {
          if (res == null) {
            return of(model);
          }
          return this.handleError(res);
        }),
        map((res) => this.updateRelationships(res, relationships))
      );
  }

  public deleteRecord<T extends JsonApiModel>(
    modelType: ModelType<T>,
    id: string,
    headers?: HttpHeaders,
    customUrl?: string
  ): Observable<Response> {
    const requestHeaders: HttpHeaders = this.buildHeaders(headers);
    const url: string = this.buildUrl(modelType, null, id, customUrl);

    return this.http.delete(url, { headers: requestHeaders })
      .pipe(
        catchError((res: HttpErrorResponse) => this.handleError(res))
      );
  }

  public peekRecord<T extends JsonApiModel>(modelType: ModelType<T>, id: string): T | null {
    const type: string = Reflect.getMetadata('JsonApiModelConfig', modelType).type;
    return this.internalStore[type] ? <T>this.internalStore[type][id] : null;
  }

  public peekAll<T extends JsonApiModel>(modelType: ModelType<T>): Array<T> {
    const type = Reflect.getMetadata('JsonApiModelConfig', modelType).type;
    const typeStore = this.internalStore[type];
    return typeStore ? Object.keys(typeStore).map((key) => <T>typeStore[key]) : [];
  }

  set headers(headers: HttpHeaders) {
    this.globalHeaders = headers;
  }

  protected buildUrl<T extends JsonApiModel>(
    modelType: ModelType<T>,
    params?: any,
    id?: string,
    customUrl?: string
  ): string {
    // TODO: use HttpParams instead of appending a string to the url
    const queryParams: string = this.toQueryString(params);

    if (customUrl) {
      return queryParams ? `${customUrl}?${queryParams}` : customUrl;
    }

    const modelConfig: ModelConfig = Reflect.getMetadata('JsonApiModelConfig', modelType);

    const baseUrl = modelConfig.baseUrl || this.datastoreConfig.baseUrl;
    const apiVersion = modelConfig.apiVersion || this.datastoreConfig.apiVersion;
    const modelEndpointUrl: string = modelConfig.modelEndpointUrl || modelConfig.type;

    const url: string = [baseUrl, apiVersion, modelEndpointUrl, id].filter((x) => x).join('/');

    return queryParams ? `${url}?${queryParams}` : url;
  }

  protected getRelationships(data: any): any {
    let relationships: any;

    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        if (data[key] instanceof JsonApiModel) {
          relationships = relationships || {};

          if (data[key].id) {
            relationships[key] = {
              data: this.buildSingleRelationshipData(data[key])
            };
          }
        } else if (data[key] instanceof Array && data[key].length > 0 && this.isValidToManyRelation(data[key])) {
          relationships = relationships || {};

          const relationshipData = data[key]
            .filter((model: JsonApiModel) => model.id)
            .map((model: JsonApiModel) => this.buildSingleRelationshipData(model));

          relationships[key] = {
            data: relationshipData
          };
        }
      }
    }

    return relationships;
  }

  protected isValidToManyRelation(objects: Array<any>): boolean {
    const isJsonApiModel = objects.every((item) => item instanceof JsonApiModel);
    const relationshipType: string = isJsonApiModel ? objects[0].modelConfig.type : '';

    return isJsonApiModel ? objects.every((item: JsonApiModel) => item.modelConfig.type === relationshipType) : false;
  }

  protected buildSingleRelationshipData(model: JsonApiModel): any {
    const relationshipType: string = model.modelConfig.type;
    const relationShipData: { type: string, id?: string, attributes?: any } = { type: relationshipType };

    if (model.id) {
      relationShipData.id = model.id;
    } else {
      const attributesMetadata: any = Reflect.getMetadata('Attribute', model);
      relationShipData.attributes = this.getDirtyAttributes(attributesMetadata, model);
    }

    return relationShipData;
  }


  protected extractQueryData<T extends JsonApiModel>(
    body: any,
    modelType: ModelType<T>,
    withMeta = false
  ): Array<T> | JsonApiQueryData<T> {
    const models: T[] = [];

    body.data.forEach((data: any) => {
      const model: T = this.deserializeModel(modelType, data);
      this.addToStore(model);

      if (body.included) {
        model.syncRelationships(data, body.included);
        this.addToStore(model);
      }

      models.push(model);
    });

    if (withMeta && withMeta === true) {
      return new JsonApiQueryData(models, this.parseMeta(body, modelType));
    }

    return models;
  }

  public deserializeModel<T extends JsonApiModel>(modelType: ModelType<T>, data: any) {
    data.attributes = this.transformSerializedNamesToPropertyNames(modelType, data.attributes);
    return new modelType(this, data);
  }

  protected extractRecordData<T extends JsonApiModel>(
    res: HttpResponse<Object>,
    modelType: ModelType<T>,
    model?: T
  ): T {
    const body: any = res.body;
    // Error in Angular < 5.2.4 (see https://github.com/angular/angular/issues/20744)
    // null is converted to 'null', so this is temporary needed to make testcase possible
    // (and to avoid a decrease of the coverage)
    if (!body || body === 'null') {
      throw new Error('no body in response');
    }

    if (!body.data) {
      if (res.status === 201 || !model) {
        throw new Error('expected data in response');
      }
      return model;
    }

    if (model) {
      model.modelInitialization = true;
      model.id = body.data.id;
      Object.assign(model, body.data.attributes);
      model.modelInitialization = false;
    }

    const deserializedModel = model || this.deserializeModel(modelType, body.data);
    this.addToStore(deserializedModel);
    if (body.included) {
      deserializedModel.syncRelationships(body.data, body.included);
      this.addToStore(deserializedModel);
    }

    return deserializedModel;
  }

  protected handleError(error: any): Observable<any> {
    if (
      error instanceof HttpErrorResponse &&
      error.error instanceof Object &&
      error.error.errors &&
      error.error.errors instanceof Array
    ) {
      const errors: ErrorResponse = new ErrorResponse(error.error.errors);
      return throwError(errors);
    }

    return throwError(error);
  }

  protected parseMeta(body: any, modelType: ModelType<JsonApiModel>): any {
    const metaModel: any = Reflect.getMetadata('JsonApiModelConfig', modelType).meta;
    return new metaModel(body);
  }

  /** @deprecated - use buildHeaders method to build request headers **/
  protected getOptions(customHeaders?: HttpHeaders): any {
    return {
      headers: this.buildHeaders(customHeaders),
    };
  }

  protected buildHeaders(customHeaders?: HttpHeaders): HttpHeaders {
    let requestHeaders: HttpHeaders = new HttpHeaders({
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json'
    });

    if (this.globalHeaders) {
      this.globalHeaders.keys().forEach((key) => {
        if (this.globalHeaders.has(key)) {
          requestHeaders = requestHeaders.set(key, this.globalHeaders.get(key)!);
        }
      });
    }

    if (customHeaders) {
      customHeaders.keys().forEach((key) => {
        if (customHeaders.has(key)) {
          requestHeaders = requestHeaders.set(key, customHeaders.get(key)!);
        }
      });
    }

    return requestHeaders;
  }

  private _toQueryString(params: any): string {
    return qs.stringify(params, { arrayFormat: 'brackets' });
  }

  public addToStore(modelOrModels: JsonApiModel | JsonApiModel[]): void {
    const models = Array.isArray(modelOrModels) ? modelOrModels : [modelOrModels];
    const type: string = models[0].modelConfig.type;
    let typeStore = this.internalStore[type];

    if (!typeStore) {
      typeStore = this.internalStore[type] = {};
    }

    for (const model of models) {
      typeStore[model.id] = model;
    }
  }

  protected resetMetadataAttributes<T extends JsonApiModel>(res: T, attributesMetadata: any, modelType: ModelType<T>) {
    for (const propertyName in attributesMetadata) {
      if (attributesMetadata.hasOwnProperty(propertyName)) {
        const metadata: any = attributesMetadata[propertyName];

        if (metadata.hasDirtyAttributes) {
          metadata.hasDirtyAttributes = false;
        }
      }
    }

    res[AttributeMetadataIndex] = attributesMetadata;
    return res;
  }

  protected updateRelationships<T extends JsonApiModel>(model: T, relationships: any): T {
    const modelsTypes: any = Reflect.getMetadata('JsonApiDatastoreConfig', this.constructor).models;

    for (const relationship in relationships) {
      if (relationships.hasOwnProperty(relationship) && model.hasOwnProperty(relationship)) {
        const relationshipModel: JsonApiModel = model[relationship];
        const hasMany: any[] = Reflect.getMetadata('HasMany', relationshipModel);
        const propertyHasMany: any = find(hasMany, (property) => {
          return modelsTypes[property.relationship] === model.constructor;
        });

        if (propertyHasMany) {
          relationshipModel[propertyHasMany.propertyName] = relationshipModel[propertyHasMany.propertyName] || [];

          const indexOfModel = relationshipModel[propertyHasMany.propertyName].indexOf(model);

          if (indexOfModel === -1) {
            relationshipModel[propertyHasMany.propertyName].push(model);
          } else {
            relationshipModel[propertyHasMany.propertyName][indexOfModel] = model;
          }
        }
      }
    }

    return model;
  }

  public get datastoreConfig(): DatastoreConfig {
    const configFromDecorator: DatastoreConfig = Reflect.getMetadata('JsonApiDatastoreConfig', this.constructor);
    return Object.assign(configFromDecorator, this.config);
  }

  public transformSerializedNamesToPropertyNames<T extends JsonApiModel>(modelType: ModelType<T>, attributes: any) {
    const serializedNameToPropertyName = this.getModelPropertyNames(modelType.prototype);
    const properties: any = {};

    Object.keys(serializedNameToPropertyName).forEach((serializedName) => {
      if (attributes && attributes[serializedName] !== null && attributes[serializedName] !== undefined) {
        properties[serializedNameToPropertyName[serializedName]] = attributes[serializedName];
      }
    });

    return properties;
  }

  protected getModelPropertyNames(model: JsonApiModel) {
    return Reflect.getMetadata('AttributeMapping', model) || [];
  }

  protected generateModel<T extends JsonApiModel>(
    modelData: any,
    modelType: ModelType<T>
  ): T {
    const deserializedModel = this.deserializeModel(modelType, modelData);

    // this.addToStore(deserializedModel);

    // if (body.included) {
    //   deserializedModel.syncRelationships(body.data, body.included);
    //   this.addToStore(deserializedModel);
    // }

    return deserializedModel;
  }

  protected getModelClassFromType<T extends JsonApiModel>(modelType: string): ModelType<T> {
    const modelsTypes: any = Reflect.getMetadata('JsonApiDatastoreConfig', this.constructor).models;

    const modelTypeClass = modelsTypes[modelType];

    if (!modelTypeClass) {
      throw new Error(`Missing model definition in datastore: ${modelType}`);
    }

    return modelTypeClass;
  }
}
