"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var json_api_query_data_1 = require("./../models/json-api-query-data");
var Http2AdapterService = /** @class */ (function () {
    function Http2AdapterService(http) {
        this.http = http;
    }
    Http2AdapterService.prototype.findAll2 = function (options) {
        var _this = this;
        var relationshipNames = options.includes
            .split(',')
            .filter(function (relationshipName) { return relationshipName; });
        var filteredRelationshipNames = this.filterUnecessaryIncludes(relationshipNames);
        // TODO: X-Push-Related: parent relationships from filteredRelationshipNames
        // ie. [profileNames.info, consumer.nesto] ===> profileNames,consumer
        var topXPushRelated = filteredRelationshipNames.map(function (relationshipName) { return relationshipName.split('.')[0]; });
        options.requestHeaders.set('X-Push-Related', topXPushRelated.join(','));
        return this.http.get(options.requestUrl, { headers: options.requestHeaders })
            .map(function (response) {
            var models = _this.generateModels(response, response.data, options.modelType);
            return new json_api_query_data_1.JsonApiQueryData(models, _this.parseMeta(response, options.modelType));
        })
            .map(function (queryData) {
            var models = queryData.getModels();
            models.forEach(function (model) {
                _this.addToStore(model);
                topXPushRelated.forEach(function (relationshipName) {
                    debugger;
                });
            });
            return queryData;
        });
        // TODO: .catch((res: any) => this.handleError(res));
    };
    Http2AdapterService.prototype.generateModels = function (body, modelsData, modelType) {
        var _this = this;
        return modelsData.map(function (modelData) { return _this.generateModel(modelData, modelType); });
    };
    // ie. profileImage,profileImage.consumer,profileImage.consumer.info
    // ===> profileImage.consumer.info is enough
    // filter out the rest
    Http2AdapterService.prototype.filterUnecessaryIncludes = function (includes) {
        return includes.filter(function (relationshipName) {
            return !includes.some(function (name) { return name.startsWith(relationshipName + "."); });
        });
    };
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
    Http2AdapterService.prototype.fetchRelationships = function (originalModel, body, modelType, withMeta, relationshipNames) {
        if (withMeta === void 0) { withMeta = false; }
        if (relationshipNames === void 0) { relationshipNames = []; }
        debugger;
    };
    return Http2AdapterService;
}());
exports.Http2AdapterService = Http2AdapterService;
//# sourceMappingURL=http2-adapter.service.js.map