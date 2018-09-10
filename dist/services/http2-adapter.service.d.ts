import { ErrorObservable } from 'rxjs/observable/ErrorObservable';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { JsonApiQueryData } from './../models/json-api-query-data';
import { ModelType } from './json-api-datastore.service';
import { JsonApiModel } from './../models/json-api.model';
import { Observable } from 'rxjs';
export interface FindAllOptions<T extends JsonApiModel> {
    includes: string;
    modelType: ModelType<T>;
    requestHeaders: HttpHeaders;
    requestUrl: string;
}
export declare abstract class Http2AdapterService {
    protected http: HttpClient;
    constructor(http: HttpClient);
    findAll2<T extends JsonApiModel>(options: FindAllOptions<T>): Observable<JsonApiQueryData<T>>;
    private makeHttp2Request<T>(requestOptions);
    private handleIncludedRelationships<T>(relationshipNames, model, requestHeaders);
    private generateModels<T>(modelsData, modelType);
    private filterUnecessaryIncludes(includes);
    private isMultipleModelsFetched(response);
    protected abstract generateModel<T extends JsonApiModel>(modelData: any, modelType: ModelType<T>): T;
    protected abstract parseMeta(body: any, modelType: ModelType<JsonApiModel>): any;
    abstract addToStore(modelOrModels: JsonApiModel | JsonApiModel[]): void;
    protected abstract getModelClassFromType<T extends JsonApiModel>(modelType: string): ModelType<T>;
    protected abstract handleError(error: any): ErrorObservable;
}
