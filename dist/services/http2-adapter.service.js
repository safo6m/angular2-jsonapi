"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var json_api_query_data_1 = require("./../models/json-api-query-data");
var Http2AdapterService = /** @class */ (function () {
    function Http2AdapterService(http) {
        this.http = http;
    }
    Http2AdapterService.prototype.findAll2 = function (options) {
        var relationshipNames = options.includes
            .split(',')
            .filter(function (relationshipName) { return relationshipName; });
        var filteredRelationshipNames = this.filterUnecessaryIncludes(relationshipNames);
        return this.makeHttp2Request(options.requestUrl, options.requestHeaders, filteredRelationshipNames);
        // TODO: .catch((res: any) => this.handleError(res));
    };
    Http2AdapterService.prototype.makeHttp2Request = function (requestUrl, requestHeaders, relationshipNames, parentModel, parentRelationshipName) {
        var _this = this;
        var topXPushRelated = relationshipNames.map(function (relationshipName) { return relationshipName.split('.')[0]; });
        // TODO: removeDuplicates from topXPushRelated
        requestHeaders.set('X-Push-Related', topXPushRelated.join(','));
        return this.http.get(requestUrl, { headers: requestHeaders })
            .map(function (response) {
            if (_this.isMultipleModelsFetched(response.data)) {
                // This can happen if there is no items in data
                // const modelType = response.data[0] ? this.getModelClassFromType(response.data[0].type) : null;
                var modelType = _this.getModelClassFromType(response.data[0].type);
                var models = modelType ? _this.generateModels(response.data, modelType) : [];
                return new json_api_query_data_1.JsonApiQueryData(models, _this.parseMeta(response, modelType));
            }
            else {
                var modelType = _this.getModelClassFromType(response.data.type);
                var relationshipModel = _this.generateModel(response.data, modelType);
                _this.addToStore(relationshipModel);
                if (parentModel && parentRelationshipName) {
                    parentModel[parentRelationshipName] = relationshipModel;
                }
                return relationshipModel;
            }
        })
            .map(function (queryData) {
            if (queryData instanceof json_api_query_data_1.JsonApiQueryData) {
                var models = queryData.getModels();
                models.forEach(function (model) {
                    _this.addToStore(model);
                    _this.handleIncludedRelationships(relationshipNames, model, requestHeaders);
                });
            }
            else {
                _this.handleIncludedRelationships(relationshipNames, queryData, requestHeaders);
            }
            return queryData;
        });
    };
    Http2AdapterService.prototype.handleIncludedRelationships = function (relationshipNames, model, requestHeaders) {
        var _this = this;
        relationshipNames.forEach(function (complexRelationshipName) {
            var relationshipName = complexRelationshipName.split('.')[0];
            var deeperRelationshipNames = complexRelationshipName.split('.').splice(1);
            if (model.data.relationships &&
                model.data.relationships[relationshipName] &&
                model.data.relationships[relationshipName].links &&
                model.data.relationships[relationshipName].links.related) {
                var relationshipUrl = model.data.relationships[relationshipName].links.related;
                _this.makeHttp2Request(relationshipUrl, requestHeaders, deeperRelationshipNames, model, relationshipName);
            }
        });
    };
    Http2AdapterService.prototype.generateModels = function (modelsData, modelType) {
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
    Http2AdapterService.prototype.isMultipleModelsFetched = function (response) {
        return Array.isArray(response.data);
    };
    return Http2AdapterService;
}());
exports.Http2AdapterService = Http2AdapterService;
//# sourceMappingURL=http2-adapter.service.js.map