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
export declare abstract class Http2AdapterService {
    protected http: HttpClient;
    constructor(http: HttpClient);
    findAll2<T extends JsonApiModel>(options: FindAllOptions<T>): Observable<JsonApiQueryData<T>>;
    private generateModels<T>(body, modelsData, modelType);
    private filterUnecessaryIncludes(includes);
    private fetchRelationships<T>(originalModel, body, modelType, withMeta?, relationshipNames?);
    protected abstract generateModel<T extends JsonApiModel>(modelData: any, modelType: ModelType<T>): T;
    protected abstract parseMeta(body: any, modelType: ModelType<JsonApiModel>): any;
    abstract addToStore(modelOrModels: JsonApiModel | JsonApiModel[]): void;
}
