import { Observable } from 'rxjs/Observable';
import { JsonApiDatastore } from '../services/json-api-datastore.service';
import { ModelConfig } from '../interfaces/model-config.interface';
export declare class JsonApiModel {
    private _datastore;
    data: any;
    id: string;
    [key: string]: any;
    lastSyncModels: Array<any>;
    constructor(_datastore: JsonApiDatastore, data?: any);
    syncRelationships(data: any, included: any, remainingModels?: Array<any>): void;
    save(params?: any, headers?: Headers): Observable<this>;
    readonly hasDirtyAttributes: boolean;
    rollbackAttributes(): void;
    readonly modelConfig: ModelConfig;
    private parseHasMany(data, included, remainingModels);
    private parseBelongsTo(data, included, remainingModels);
    private getHasManyRelationship<T>(modelType, data, included, typeName, remainingModels);
    private getBelongsToRelationship<T>(modelType, data, included, typeName, remainingModels);
    private createOrPeek<T>(modelType, data);
}
