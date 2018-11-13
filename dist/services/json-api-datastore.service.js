"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var core_1 = require("@angular/core");
var http_1 = require("@angular/common/http");
var find_1 = require("lodash-es/find");
var operators_1 = require("rxjs/operators");
var rxjs_1 = require("rxjs");
var json_api_model_1 = require("../models/json-api.model");
var error_response_model_1 = require("../models/error-response.model");
var json_api_query_data_1 = require("../models/json-api-query-data");
var qs = require("qs");
var symbols_1 = require("../constants/symbols");
var http2_adapter_service_1 = require("./http2-adapter.service");
/**
 * HACK/FIXME:
 * Type 'symbol' cannot be used as an index type.
 * TypeScript 2.9.x
 * See https://github.com/Microsoft/TypeScript/issues/24587.
 */
// tslint:disable-next-line:variable-name
var AttributeMetadataIndex = symbols_1.AttributeMetadata;
var JsonApiDatastore = /** @class */ (function (_super) {
    __extends(JsonApiDatastore, _super);
    function JsonApiDatastore(http) {
        var _this = _super.call(this, http) || this;
        _this.http = http;
        _this.globalRequestOptions = {};
        _this.internalStore = {};
        _this.toQueryString = _this.datastoreConfig.overrides
            && _this.datastoreConfig.overrides.toQueryString ?
            _this.datastoreConfig.overrides.toQueryString : _this._toQueryString;
        return _this;
    }
    Object.defineProperty(JsonApiDatastore.prototype, "getDirtyAttributes", {
        get: function () {
            if (this.datastoreConfig.overrides
                && this.datastoreConfig.overrides.getDirtyAttributes) {
                return this.datastoreConfig.overrides.getDirtyAttributes;
            }
            return JsonApiDatastore.getDirtyAttributes;
        },
        enumerable: true,
        configurable: true
    });
    JsonApiDatastore.prototype.findAll = function (modelType, params, headers, customUrl, http2) {
        var _this = this;
        if (http2 === void 0) { http2 = false; }
        var url = this.buildUrl(modelType, params, undefined, customUrl);
        var requestOptions = this.buildRequestOptions({ headers: headers, observe: 'response' });
        if (!http2) {
            return this.http.get(url, requestOptions)
                .pipe(operators_1.map(function (res) { return _this.extractQueryData(res, modelType, true); }), operators_1.catchError(function (res) { return _this.handleError(res); }));
        }
        else {
            var queryParams = params || {};
            var includes = queryParams.include || '';
            return _super.prototype.findAll2.call(this, {
                includes: includes,
                modelType: modelType,
                requestOptions: requestOptions,
                requestUrl: url,
            });
        }
    };
    JsonApiDatastore.prototype.findRecord = function (modelType, id, params, headers, customUrl, http2) {
        var _this = this;
        if (http2 === void 0) { http2 = false; }
        var requestOptions = this.buildRequestOptions({ headers: headers, observe: 'response' });
        var url = this.buildUrl(modelType, params, id, customUrl);
        if (!http2) {
            return this.http.get(url, requestOptions)
                .pipe(operators_1.map(function (res) { return _this.extractRecordData(res, modelType); }), operators_1.catchError(function (res) { return _this.handleError(res); }));
        }
        else {
            var queryParams = params || {};
            var includes = queryParams.include || '';
            return _super.prototype.findRecord2.call(this, {
                includes: includes,
                modelType: modelType,
                requestOptions: {
                    headers: headers || new http_1.HttpHeaders()
                },
                requestUrl: url,
            });
        }
    };
    JsonApiDatastore.prototype.createRecord = function (modelType, data) {
        return new modelType(this, { attributes: data });
    };
    JsonApiDatastore.getDirtyAttributes = function (attributesMetadata) {
        var dirtyData = {};
        for (var propertyName in attributesMetadata) {
            if (attributesMetadata.hasOwnProperty(propertyName)) {
                var metadata = attributesMetadata[propertyName];
                if (metadata.hasDirtyAttributes) {
                    var attributeName = metadata.serializedName != null ? metadata.serializedName : propertyName;
                    dirtyData[attributeName] = metadata.serialisationValue ? metadata.serialisationValue : metadata.newValue;
                }
            }
        }
        return dirtyData;
    };
    JsonApiDatastore.prototype.saveRecord = function (attributesMetadata, model, params, headers, customUrl) {
        var _this = this;
        var modelType = model.constructor;
        var modelConfig = model.modelConfig;
        var typeName = modelConfig.type;
        var requestHeaders = this.buildHttpHeaders(headers);
        var relationships = this.getRelationships(model);
        var url = this.buildUrl(modelType, params, model.id, customUrl);
        var httpCall;
        var body = {
            data: {
                relationships: relationships,
                type: typeName,
                id: model.id,
                attributes: this.getDirtyAttributes(attributesMetadata, model)
            }
        };
        var requestOptions = this.buildRequestOptions({ headers: headers, observe: 'response' });
        if (model.id) {
            httpCall = this.http.patch(url, body, requestOptions);
        }
        else {
            httpCall = this.http.post(url, body, requestOptions);
        }
        return httpCall
            .pipe(operators_1.map(function (res) { return [200, 201].indexOf(res.status) !== -1 ? _this.extractRecordData(res, modelType, model) : model; }), operators_1.catchError(function (res) {
            if (res == null) {
                return rxjs_1.of(model);
            }
            return _this.handleError(res);
        }), operators_1.map(function (res) { return _this.updateRelationships(res, relationships); }));
    };
    JsonApiDatastore.prototype.deleteRecord = function (modelType, id, headers, customUrl) {
        var _this = this;
        var requestOptions = this.buildRequestOptions({ headers: headers });
        var url = this.buildUrl(modelType, null, id, customUrl);
        return this.http.delete(url, requestOptions)
            .pipe(operators_1.catchError(function (res) { return _this.handleError(res); }));
    };
    JsonApiDatastore.prototype.peekRecord = function (modelType, id) {
        var type = Reflect.getMetadata('JsonApiModelConfig', modelType).type;
        return this.internalStore[type] ? this.internalStore[type][id] : null;
    };
    JsonApiDatastore.prototype.peekAll = function (modelType) {
        var type = Reflect.getMetadata('JsonApiModelConfig', modelType).type;
        var typeStore = this.internalStore[type];
        return typeStore ? Object.keys(typeStore).map(function (key) { return typeStore[key]; }) : [];
    };
    Object.defineProperty(JsonApiDatastore.prototype, "headers", {
        set: function (headers) {
            this.globalHeaders = headers;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(JsonApiDatastore.prototype, "requestOptions", {
        set: function (requestOptions) {
            this.globalRequestOptions = requestOptions;
        },
        enumerable: true,
        configurable: true
    });
    JsonApiDatastore.prototype.buildUrl = function (modelType, params, id, customUrl) {
        // TODO: use HttpParams instead of appending a string to the url
        var queryParams = this.toQueryString(params);
        if (customUrl) {
            return queryParams ? customUrl + "?" + queryParams : customUrl;
        }
        var modelConfig = Reflect.getMetadata('JsonApiModelConfig', modelType);
        var baseUrl = modelConfig.baseUrl || this.datastoreConfig.baseUrl;
        var apiVersion = modelConfig.apiVersion || this.datastoreConfig.apiVersion;
        var modelEndpointUrl = modelConfig.modelEndpointUrl || modelConfig.type;
        var url = [baseUrl, apiVersion, modelEndpointUrl, id].filter(function (x) { return x; }).join('/');
        return queryParams ? url + "?" + queryParams : url;
    };
    JsonApiDatastore.prototype.getRelationships = function (data) {
        var _this = this;
        var relationships;
        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                if (data[key] instanceof json_api_model_1.JsonApiModel) {
                    relationships = relationships || {};
                    if (data[key].id) {
                        relationships[key] = {
                            data: this.buildSingleRelationshipData(data[key])
                        };
                    }
                }
                else if (data[key] instanceof Array && data[key].length > 0 && this.isValidToManyRelation(data[key])) {
                    relationships = relationships || {};
                    var relationshipData = data[key]
                        .filter(function (model) { return model.id; })
                        .map(function (model) { return _this.buildSingleRelationshipData(model); });
                    relationships[key] = {
                        data: relationshipData
                    };
                }
            }
        }
        return relationships;
    };
    JsonApiDatastore.prototype.isValidToManyRelation = function (objects) {
        var isJsonApiModel = objects.every(function (item) { return item instanceof json_api_model_1.JsonApiModel; });
        var relationshipType = isJsonApiModel ? objects[0].modelConfig.type : '';
        return isJsonApiModel ? objects.every(function (item) { return item.modelConfig.type === relationshipType; }) : false;
    };
    JsonApiDatastore.prototype.buildSingleRelationshipData = function (model) {
        var relationshipType = model.modelConfig.type;
        var relationShipData = { type: relationshipType };
        if (model.id) {
            relationShipData.id = model.id;
        }
        else {
            var attributesMetadata = Reflect.getMetadata('Attribute', model);
            relationShipData.attributes = this.getDirtyAttributes(attributesMetadata, model);
        }
        return relationShipData;
    };
    JsonApiDatastore.prototype.extractQueryData = function (response, modelType, withMeta) {
        var _this = this;
        if (withMeta === void 0) { withMeta = false; }
        var body = response.body;
        var models = [];
        body.data.forEach(function (data) {
            var model = _this.deserializeModel(modelType, data);
            _this.addToStore(model);
            if (body.included) {
                model.syncRelationships(data, body.included);
                _this.addToStore(model);
            }
            models.push(model);
        });
        if (withMeta && withMeta === true) {
            return new json_api_query_data_1.JsonApiQueryData(models, this.parseMeta(body, modelType));
        }
        return models;
    };
    JsonApiDatastore.prototype.deserializeModel = function (modelType, data) {
        data.attributes = this.transformSerializedNamesToPropertyNames(modelType, data.attributes);
        return new modelType(this, data);
    };
    JsonApiDatastore.prototype.extractRecordData = function (res, modelType, model) {
        var body = res.body;
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
        var deserializedModel = model || this.deserializeModel(modelType, body.data);
        this.addToStore(deserializedModel);
        if (body.included) {
            deserializedModel.syncRelationships(body.data, body.included);
            this.addToStore(deserializedModel);
        }
        return deserializedModel;
    };
    JsonApiDatastore.prototype.handleError = function (error) {
        if (error instanceof http_1.HttpErrorResponse &&
            error.error instanceof Object &&
            error.error.errors &&
            error.error.errors instanceof Array) {
            var errors = new error_response_model_1.ErrorResponse(error.error.errors);
            return rxjs_1.throwError(errors);
        }
        return rxjs_1.throwError(error);
    };
    JsonApiDatastore.prototype.parseMeta = function (body, modelType) {
        var metaModel = Reflect.getMetadata('JsonApiModelConfig', modelType).meta;
        return new metaModel(body);
    };
    /** @deprecated - use buildHttpHeaders method to build request headers **/
    JsonApiDatastore.prototype.getOptions = function (customHeaders) {
        return {
            headers: this.buildHttpHeaders(customHeaders),
        };
    };
    JsonApiDatastore.prototype.buildHttpHeaders = function (customHeaders) {
        var _this = this;
        var requestHeaders = new http_1.HttpHeaders({
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json'
        });
        if (this.globalHeaders) {
            this.globalHeaders.keys().forEach(function (key) {
                if (_this.globalHeaders.has(key)) {
                    requestHeaders = requestHeaders.set(key, _this.globalHeaders.get(key));
                }
            });
        }
        if (customHeaders) {
            customHeaders.keys().forEach(function (key) {
                if (customHeaders.has(key)) {
                    requestHeaders = requestHeaders.set(key, customHeaders.get(key));
                }
            });
        }
        return requestHeaders;
    };
    JsonApiDatastore.prototype.buildRequestOptions = function (customOptions) {
        if (customOptions === void 0) { customOptions = {}; }
        var httpHeaders = this.buildHttpHeaders(customOptions.headers);
        var requestOptions = Object.assign(customOptions, {
            headers: httpHeaders
        });
        return Object.assign(this.globalRequestOptions, requestOptions);
    };
    JsonApiDatastore.prototype._toQueryString = function (params) {
        return qs.stringify(params, { arrayFormat: 'brackets' });
    };
    JsonApiDatastore.prototype.addToStore = function (modelOrModels) {
        var models = Array.isArray(modelOrModels) ? modelOrModels : [modelOrModels];
        var type = models[0].modelConfig.type;
        var typeStore = this.internalStore[type];
        if (!typeStore) {
            typeStore = this.internalStore[type] = {};
        }
        for (var _i = 0, models_1 = models; _i < models_1.length; _i++) {
            var model = models_1[_i];
            typeStore[model.id] = model;
        }
    };
    JsonApiDatastore.prototype.resetMetadataAttributes = function (res, attributesMetadata, modelType) {
        for (var propertyName in attributesMetadata) {
            if (attributesMetadata.hasOwnProperty(propertyName)) {
                var metadata = attributesMetadata[propertyName];
                if (metadata.hasDirtyAttributes) {
                    metadata.hasDirtyAttributes = false;
                }
            }
        }
        res[AttributeMetadataIndex] = attributesMetadata;
        return res;
    };
    JsonApiDatastore.prototype.updateRelationships = function (model, relationships) {
        var modelsTypes = Reflect.getMetadata('JsonApiDatastoreConfig', this.constructor).models;
        for (var relationship in relationships) {
            if (relationships.hasOwnProperty(relationship) && model.hasOwnProperty(relationship)) {
                var relationshipModel = model[relationship];
                var hasMany = Reflect.getMetadata('HasMany', relationshipModel);
                var propertyHasMany = find_1.default(hasMany, function (property) {
                    return modelsTypes[property.relationship] === model.constructor;
                });
                if (propertyHasMany) {
                    relationshipModel[propertyHasMany.propertyName] = relationshipModel[propertyHasMany.propertyName] || [];
                    var indexOfModel = relationshipModel[propertyHasMany.propertyName].indexOf(model);
                    if (indexOfModel === -1) {
                        relationshipModel[propertyHasMany.propertyName].push(model);
                    }
                    else {
                        relationshipModel[propertyHasMany.propertyName][indexOfModel] = model;
                    }
                }
            }
        }
        return model;
    };
    Object.defineProperty(JsonApiDatastore.prototype, "datastoreConfig", {
        get: function () {
            var configFromDecorator = Reflect.getMetadata('JsonApiDatastoreConfig', this.constructor);
            return Object.assign(configFromDecorator, this.config);
        },
        enumerable: true,
        configurable: true
    });
    JsonApiDatastore.prototype.transformSerializedNamesToPropertyNames = function (modelType, attributes) {
        var serializedNameToPropertyName = this.getModelPropertyNames(modelType.prototype);
        var properties = {};
        Object.keys(serializedNameToPropertyName).forEach(function (serializedName) {
            if (attributes && attributes[serializedName] !== null && attributes[serializedName] !== undefined) {
                properties[serializedNameToPropertyName[serializedName]] = attributes[serializedName];
            }
        });
        return properties;
    };
    JsonApiDatastore.prototype.getModelPropertyNames = function (model) {
        return Reflect.getMetadata('AttributeMapping', model) || [];
    };
    JsonApiDatastore.prototype.generateModel = function (modelData, modelType) {
        var deserializedModel = this.deserializeModel(modelType, modelData);
        // this.addToStore(deserializedModel);
        // if (body.included) {
        //   deserializedModel.syncRelationships(body.data, body.included);
        //   this.addToStore(deserializedModel);
        // }
        return deserializedModel;
    };
    JsonApiDatastore.prototype.getModelClassFromType = function (modelType) {
        var modelsTypes = Reflect.getMetadata('JsonApiDatastoreConfig', this.constructor).models;
        var modelTypeClass = modelsTypes[modelType];
        if (!modelTypeClass) {
            throw new Error("Missing model definition in datastore: " + modelType);
        }
        return modelTypeClass;
    };
    JsonApiDatastore.decorators = [
        { type: core_1.Injectable },
    ];
    /** @nocollapse */
    JsonApiDatastore.ctorParameters = function () { return [
        { type: http_1.HttpClient }
    ]; };
    return JsonApiDatastore;
}(http2_adapter_service_1.Http2AdapterService));
exports.JsonApiDatastore = JsonApiDatastore;
//# sourceMappingURL=json-api-datastore.service.js.map