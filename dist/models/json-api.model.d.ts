import { Observable } from 'rxjs';
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
    private parseHasMany;
    private parseBelongsTo;
    private getHasManyRelationship;
    private getBelongsToRelationship;
    private createOrPeek;
}
