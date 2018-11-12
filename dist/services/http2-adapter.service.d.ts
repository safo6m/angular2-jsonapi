import { HttpClient, HttpHeaders } from '@angular/common/http';
import { JsonApiQueryData } from './../models/json-api-query-data';
import { ModelType } from './json-api-datastore.service';
import { JsonApiModel } from './../models/json-api.model';
import { Observable } from 'rxjs';
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
export declare abstract class Http2AdapterService {
    protected http: HttpClient;
    constructor(http: HttpClient);
    findRecord2<T extends JsonApiModel>(options: FindRecordOptions<T>): Observable<T>;
    findAll2<T extends JsonApiModel>(options: FindAllOptions<T>): Observable<JsonApiQueryData<T>>;
    private makeHttp2Request;
    private handleIncludedRelationships;
    private generateModels;
    private filterUnecessaryIncludes;
    private isMultipleModelsFetched;
    protected abstract generateModel<T extends JsonApiModel>(modelData: any, modelType: ModelType<T>): T;
    protected abstract parseMeta(body: any, modelType: ModelType<JsonApiModel>): any;
    abstract addToStore(modelOrModels: JsonApiModel | JsonApiModel[]): void;
    protected abstract getModelClassFromType<T extends JsonApiModel>(modelType: string): ModelType<T>;
    protected abstract handleError(error: any): Observable<any>;
}
