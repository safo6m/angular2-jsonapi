"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var json_api_query_data_1 = require("./../models/json-api-query-data");
var rxjs_1 = require("rxjs");
var remove_duplicates_helper_1 = require("../helpers/remove-duplicates.helper");
var Http2AdapterService = /** @class */ (function () {
    function Http2AdapterService(http) {
        this.http = http;
    }
    Http2AdapterService.prototype.findRecord2 = function (options) {
        var _this = this;
        var relationshipNames = options.includes
            .split(',')
            .filter(function (relationshipName) { return relationshipName; });
        var filteredRelationshipNames = this.filterUnecessaryIncludes(relationshipNames);
        return this.makeHttp2Request({
            requestUrl: options.requestUrl,
            requestHeaders: options.requestHeaders,
            relationshipNames: filteredRelationshipNames,
            modelType: options.modelType
        })
            .catch(function (res) { return _this.handleError(res); });
    };
    Http2AdapterService.prototype.findAll2 = function (options) {
        var _this = this;
        var relationshipNames = options.includes
            .split(',')
            .filter(function (relationshipName) { return relationshipName; });
        var filteredRelationshipNames = this.filterUnecessaryIncludes(relationshipNames);
        return this.makeHttp2Request({
            requestUrl: options.requestUrl,
            requestHeaders: options.requestHeaders,
            relationshipNames: filteredRelationshipNames,
            modelType: options.modelType
        })
            .catch(function (res) { return _this.handleError(res); });
    };
    Http2AdapterService.prototype.makeHttp2Request = function (requestOptions) {
        var _this = this;
        var results = new rxjs_1.ReplaySubject();
        var requests$ = [];
        var topXPushRelated = requestOptions.relationshipNames.map(function (relationshipName) {
            return relationshipName.split('.')[0];
        });
        topXPushRelated = remove_duplicates_helper_1.removeDuplicates(topXPushRelated);
        var headers = requestOptions.requestHeaders;
        if (topXPushRelated.length) {
            headers = headers.set('X-Push-Related', topXPushRelated.join(','));
        }
        else {
            headers = headers.delete('X-Push-Related');
        }
        var mainRequest$ = this.http.get(requestOptions.requestUrl, { headers: headers })
            .map(function (response) {
            if (_this.isMultipleModelsFetched(response)) {
                // tslint:disable-next-line:max-line-length
                var modelType = requestOptions.modelType || (response.data[0] ? _this.getModelClassFromType(response.data[0].type) : null);
                var models = modelType ? _this.generateModels(response.data, modelType) : [];
                // tslint:disable-next-line:max-line-length
                return requestOptions.modelType ? new json_api_query_data_1.JsonApiQueryData(models, _this.parseMeta(response, requestOptions.modelType)) : models;
            }
            else {
                var modelType = _this.getModelClassFromType(response.data.type);
                var relationshipModel = _this.generateModel(response.data, modelType);
                _this.addToStore(relationshipModel);
                if (requestOptions.parentModel && requestOptions.parentRelationshipName) {
                    requestOptions.parentModel[requestOptions.parentRelationshipName] = relationshipModel;
                }
                return relationshipModel;
            }
        })
            .map(function (queryData) {
            if (queryData instanceof json_api_query_data_1.JsonApiQueryData || Array.isArray(queryData)) {
                var models = queryData instanceof json_api_query_data_1.JsonApiQueryData ? queryData.getModels() : queryData;
                models.forEach(function (model) {
                    _this.addToStore(model);
                    var request$ = _this.handleIncludedRelationships(requestOptions.relationshipNames, model, headers);
                    requests$.push(request$);
                });
            }
            else {
                var request$ = _this.handleIncludedRelationships(requestOptions.relationshipNames, queryData, headers);
                requests$.push(request$);
            }
            return queryData;
        }).map(function (queryData) {
            if (!requests$.length) {
                results.next(queryData);
            }
            else {
                rxjs_1.Observable.combineLatest.apply(rxjs_1.Observable, requests$).subscribe(function () {
                    results.next(queryData);
                });
            }
            return queryData;
        });
        mainRequest$.subscribe();
        return results;
    };
    Http2AdapterService.prototype.handleIncludedRelationships = function (relationshipNames, model, requestHeaders) {
        var _this = this;
        var results = new rxjs_1.ReplaySubject();
        var requests$ = [];
        relationshipNames.forEach(function (complexRelationshipName) {
            var relationshipName = complexRelationshipName.split('.')[0];
            var deeperRelationshipNames = complexRelationshipName.split('.').splice(1);
            if (model.data.relationships &&
                model.data.relationships[relationshipName] &&
                model.data.relationships[relationshipName].links &&
                model.data.relationships[relationshipName].links.related) {
                var relationshipUrl = model.data.relationships[relationshipName].links.related;
                var request$ = _this.makeHttp2Request({
                    requestHeaders: requestHeaders,
                    requestUrl: relationshipUrl,
                    relationshipNames: deeperRelationshipNames,
                    parentModel: model,
                    parentRelationshipName: relationshipName
                });
                requests$.push(request$);
            }
        });
        if (!requests$.length) {
            results.next(false);
        }
        else {
            rxjs_1.Observable.combineLatest.apply(rxjs_1.Observable, requests$).subscribe(function () {
                results.next(false);
            });
        }
        return results;
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