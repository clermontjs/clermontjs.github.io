/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.11 Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.11',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value === 'object' && value &&
                        !isArray(value) && !isFunction(value) &&
                        !(value instanceof RegExp)) {

                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that is expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite and existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            bundlesMap = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part, length = ary.length;
            for (i = 0; i < length; i++) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                        //End of the line. Keep at least one non-dot
                        //path segment at the front so it can be mapped
                        //correctly to disk. Otherwise, there is likely
                        //no path mapping for a path starting with '..'.
                        //This can still fail, but catches the most reasonable
                        //uses of ..
                        break;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                foundMap, foundI, foundStarMap, starI,
                baseParts = baseName && baseName.split('/'),
                normalizedBaseParts = baseParts,
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name && name.charAt(0) === '.') {
                //If have a base name, try to normalize against it,
                //otherwise, assume it is a top-level require that will
                //be relative to baseUrl in the end.
                if (baseName) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that 'directory' and not name of the baseName's
                    //module. For instance, baseName of 'one/two/three', maps to
                    //'one/two/three.js', but we want the directory, 'one/two' for
                    //this normalization.
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = name.split('/');
                    lastIndex = name.length - 1;

                    // If wanting node ID compatibility, strip .js from end
                    // of IDs. Have to do this here, and not in nameToUrl
                    // because node allows either .js or non .js to map
                    // to same file.
                    if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                        name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                    }

                    name = normalizedBaseParts.concat(name);
                    trimDots(name);
                    name = name.join('/');
                } else if (name.indexOf('./') === 0) {
                    // No baseName, so this is ID is resolved relative
                    // to baseUrl, pull off the leading dot.
                    name = name.substring(2);
                }
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            // If the name points to a package's name, use
            // the package main instead.
            pkgMain = getOwn(config.pkgs, name);

            return pkgMain ? pkgMain : name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);
                context.require([id]);
                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        normalizedName = normalize(name, parentName, applyMap);
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                //Array splice in the values since the context code has a
                //local var ref to defQueue, so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [defQueue.length, 0].concat(globalDefQueue));
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return (defined[mod.map.id] = mod.exports);
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            return  getOwn(config.config, mod.map.id) || {};
                        },
                        exports: mod.exports || (mod.exports = {})
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                var map = mod.map,
                    modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            // Favor return value over exports. If node/cjs in play,
                            // then will not have a return value anyway. Favor
                            // module.exports assignment over exports object.
                            if (this.map.isDefine && exports === undefined) {
                                cjsModule = this.module;
                                if (cjsModule) {
                                    exports = cjsModule.exports;
                                } else if (this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                err.requireType = this.map.isDefine ? 'define' : 'require';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        bundleId = getOwn(bundlesMap, this.map.id),
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    //If a paths config, then just load that file instead to
                    //resolve the plugin, as it is built into that paths layer.
                    if (bundleId) {
                        this.map.url = context.nameToUrl(bundleId);
                        this.load();
                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' + args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths since they require special processing,
                //they are additive.
                var shim = config.shim,
                    objs = {
                        paths: true,
                        bundles: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (!config[prop]) {
                            config[prop] = {};
                        }
                        mixin(config[prop], value, true, true);
                    } else {
                        config[prop] = value;
                    }
                });

                //Reverse map the bundles
                if (cfg.bundles) {
                    eachProp(cfg.bundles, function (value, prop) {
                        each(value, function (v) {
                            if (v !== prop) {
                                bundlesMap[v] = prop;
                            }
                        });
                    });
                }

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location, name;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;

                        name = pkgObj.name;
                        location = pkgObj.location;
                        if (location) {
                            config.paths[name] = pkgObj.location;
                        }

                        //Save pointer to main module ID for pkg name.
                        //Remove leading dot in main, so main paths are normalized,
                        //and remove any trailing .js, since different package
                        //envs have different conventions: some use a module name,
                        //some use a file name.
                        config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                     .replace(currDirRegExp, '')
                                     .replace(jsSuffixRegExp, '');
                    });
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        removeScript(id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        //Clean queued defines too. Go backwards
                        //in array so that the splices do not
                        //mess up the iteration.
                        eachReverse(defQueue, function(args, i) {
                            if(args[0] === id) {
                                defQueue.splice(i, 1);
                            }
                        });

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overridden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, syms, i, parentModule, url,
                    parentPath, bundleId,
                    pkgMain = getOwn(config.pkgs, moduleName);

                if (pkgMain) {
                    moduleName = pkgMain;
                }

                bundleId = getOwn(bundlesMap, moduleName);

                if (bundleId) {
                    return context.nameToUrl(bundleId, ext, skipExt);
                }

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');

                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/^data\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    return onError(makeError('scripterror', 'Script error for: ' + data.id, evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Creates the node for the load command. Only used in browser envs.
     */
    req.createNode = function (config, moduleName, url) {
        var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
        node.type = config.scriptType || 'text/javascript';
        node.charset = 'utf-8';
        node.async = true;
        return node;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = req.createNode(config, moduleName, url);

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation that a build has been done so that
                //only one script needs to be loaded anyway. This may need to be
                //reevaluated if other use cases become common.
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser && !cfg.skipDataMain) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                 //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        (context ? context.defQueue : globalDefQueue).push([name, deps, callback]);
    };

    define.amd = {
        jQuery: true
    };


    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));
;
/* global requirejs */
requirejs.config({
    baseUrl: '/js',
    paths: {
        'jquery': '../../bower_components/jquery/dist/jquery',
        'text': '../../bower_components/requirejs-text/text',
        'modernizr': '../../bower_components/modernizr/modernizr',
        'fastclick': '../../bower_components/fastclick/lib/fastclick',
        'foundation/abide': '../../bower_components/foundation/js/foundation/foundation.abide',
        'foundation/accordion': '../../bower_components/foundation/js/foundation/foundation.accordion',
        'foundation/alert': '../../bower_components/foundation/js/foundation/foundation.alert',
        'foundation/clearing': '../../bower_components/foundation/js/foundation/foundation.clearing',
        'foundation/dropdown': '../../bower_components/foundation/js/foundation/foundation.dropdown',
        'foundation/equalizer': '../../bower_components/foundation/js/foundation/foundation.equalizer',
        'foundation/interchange': '../../bower_components/foundation/js/foundation/foundation.interchange',
        'foundation/joyride': '../../bower_components/foundation/js/foundation/foundation.joyride',
        'foundation/magellan': '../../bower_components/foundation/js/foundation/foundation.magellan',
        'foundation/offcanvas': '../../bower_components/foundation/js/foundation/foundation.offcanvas',
        'foundation/orbit': '../../bower_components/foundation/js/foundation/foundation.orbit',
        'foundation/reveal': '../../bower_components/foundation/js/foundation/foundation.reveal',
        'foundation/tab': '../../bower_components/foundation/js/foundation/foundation.tab',
        'foundation/tooltip': '../../bower_components/foundation/js/foundation/foundation.tooltip',
        'foundation/topbar': '../../bower_components/foundation/js/foundation/foundation.topbar',
        'foundation/foundation': '../../bower_components/foundation/js/foundation/foundation',
        'screenfull' : '//cdnjs.cloudflare.com/ajax/libs/screenfull.js/1.0.4/screenfull.min',
        'popcorn': 'http://popcornjs.org/code/dist/popcorn-complete.min',
        'popcorn-slides': 'popcorn-slides',
    },

    shim: {
        'modernizr': { exports: 'Modernizr' },
        'screenfull': {exports: 'screenfull'},
        'popcorn': { exports: 'Popcorn' },
        'popcorn-slides': { deps: ['popcorn'] },
        'foundation/abide': { deps: ['foundation/foundation'] },
        'foundation/accordion': { deps: ['foundation/foundation'] },
        'foundation/alert': { deps: ['foundation/foundation'] },
        'foundation/clearing': { deps: ['foundation/foundation'] },
        'foundation/dropdown': { deps: ['foundation/foundation'] },
        'foundation/equalizer': { deps: ['foundation/foundation'] },
        'foundation/interchange': { deps: ['foundation/foundation'] },
        'foundation/joyride': { deps: ['foundation/foundation'] },
        'foundation/magellan': { deps: ['foundation/foundation'] },
        'foundation/offcanvas': { deps: ['foundation/foundation'] },
        'foundation/orbit': { deps: ['foundation/foundation'] },
        'foundation/reveal': { deps: ['foundation/foundation'] },
        'foundation/tab': { deps: ['foundation/foundation'] },
        'foundation/tooltip': { deps: ['foundation/foundation'] },
        'foundation/topbar': { deps: ['foundation/foundation'] },
        'foundation/foundation': {
            deps: ['jquery', 'modernizr', 'fastclick'],
            exports: 'jQuery'
        }
    }
});
;
/*!
 * jQuery JavaScript Library v2.1.0
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-01-23T21:10Z
 */

/*!
 * Sizzle CSS Selector Engine v1.10.16
 * http://sizzlejs.com/
 *
 * Copyright 2013 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-01-13
 */

/*!
 * Modernizr v2.7.1
 * www.modernizr.com
 *
 * Copyright (c) Faruk Ates, Paul Irish, Alex Sexton
 * Available under the BSD and MIT licenses: www.modernizr.com/license/
 */

/**
 * @preserve FastClick: polyfill to remove click delays on browsers with touch UIs.
 *
 * @version 0.6.12
 * @codingstandard ftlabs-jsv2
 * @copyright The Financial Times Limited [All Rights Reserved]
 * @license MIT License (see LICENSE.txt)
 */

/*
 * Foundation Responsive Library
 * http://foundation.zurb.com
 * Copyright 2014, ZURB
 * Free to use under the MIT license.
 * http://www.opensource.org/licenses/mit-license.php
*/

/*
   * jquery.requestAnimationFrame
   * https://github.com/gnarf37/jquery-requestAnimationFrame
   * Requires jQuery 1.8+
   *
   * Copyright (c) 2012 Corey Frang
   * Licensed under the MIT license.
   */

function FastClick(e){var t,n=this;this.trackingClick=!1,this.trackingClickStart=0,this.targetElement=null,this.touchStartX=0,this.touchStartY=0,this.lastTouchIdentifier=0,this.touchBoundary=10,this.layer=e;if(!e||!e.nodeType)throw new TypeError("Layer must be a document node");this.onClick=function(){return FastClick.prototype.onClick.apply(n,arguments)},this.onMouse=function(){return FastClick.prototype.onMouse.apply(n,arguments)},this.onTouchStart=function(){return FastClick.prototype.onTouchStart.apply(n,arguments)},this.onTouchMove=function(){return FastClick.prototype.onTouchMove.apply(n,arguments)},this.onTouchEnd=function(){return FastClick.prototype.onTouchEnd.apply(n,arguments)},this.onTouchCancel=function(){return FastClick.prototype.onTouchCancel.apply(n,arguments)};if(FastClick.notNeeded(e))return;this.deviceIsAndroid&&(e.addEventListener("mouseover",this.onMouse,!0),e.addEventListener("mousedown",this.onMouse,!0),e.addEventListener("mouseup",this.onMouse,!0)),e.addEventListener("click",this.onClick,!0),e.addEventListener("touchstart",this.onTouchStart,!1),e.addEventListener("touchmove",this.onTouchMove,!1),e.addEventListener("touchend",this.onTouchEnd,!1),e.addEventListener("touchcancel",this.onTouchCancel,!1),Event.prototype.stopImmediatePropagation||(e.removeEventListener=function(t,n,r){var i=Node.prototype.removeEventListener;t==="click"?i.call(e,t,n.hijacked||n,r):i.call(e,t,n,r)},e.addEventListener=function(t,n,r){var i=Node.prototype.addEventListener;t==="click"?i.call(e,t,n.hijacked||(n.hijacked=function(e){e.propagationStopped||n(e)}),r):i.call(e,t,n,r)}),typeof e.onclick=="function"&&(t=e.onclick,e.addEventListener("click",function(e){t(e)},!1),e.onclick=null)}(function(e,t){typeof module=="object"&&typeof module.exports=="object"?module.exports=e.document?t(e,!0):function(e){if(!e.document)throw new Error("jQuery requires a window with a document");return t(e)}:t(e)})(typeof window!="undefined"?window:this,function(window,noGlobal){function isArraylike(e){var t=e.length,n=jQuery.type(e);return n==="function"||jQuery.isWindow(e)?!1:e.nodeType===1&&t?!0:n==="array"||t===0||typeof t=="number"&&t>0&&t-1 in e}function winnow(e,t,n){if(jQuery.isFunction(t))return jQuery.grep(e,function(e,r){return!!t.call(e,r,e)!==n});if(t.nodeType)return jQuery.grep(e,function(e){return e===t!==n});if(typeof t=="string"){if(risSimple.test(t))return jQuery.filter(t,e,n);t=jQuery.filter(t,e)}return jQuery.grep(e,function(e){return indexOf.call(t,e)>=0!==n})}function sibling(e,t){while((e=e[t])&&e.nodeType!==1);return e}function createOptions(e){var t=optionsCache[e]={};return jQuery.each(e.match(rnotwhite)||[],function(e,n){t[n]=!0}),t}function completed(){document.removeEventListener("DOMContentLoaded",completed,!1),window.removeEventListener("load",completed,!1),jQuery.ready()}function Data(){Object.defineProperty(this.cache={},0,{get:function(){return{}}}),this.expando=jQuery.expando+Math.random()}function dataAttr(e,t,n){var r;if(n===undefined&&e.nodeType===1){r="data-"+t.replace(rmultiDash,"-$1").toLowerCase(),n=e.getAttribute(r);if(typeof n=="string"){try{n=n==="true"?!0:n==="false"?!1:n==="null"?null:+n+""===n?+n:rbrace.test(n)?jQuery.parseJSON(n):n}catch(i){}data_user.set(e,t,n)}else n=undefined}return n}function returnTrue(){return!0}function returnFalse(){return!1}function safeActiveElement(){try{return document.activeElement}catch(e){}}function manipulationTarget(e,t){return jQuery.nodeName(e,"table")&&jQuery.nodeName(t.nodeType!==11?t:t.firstChild,"tr")?e.getElementsByTagName("tbody")[0]||e.appendChild(e.ownerDocument.createElement("tbody")):e}function disableScript(e){return e.type=(e.getAttribute("type")!==null)+"/"+e.type,e}function restoreScript(e){var t=rscriptTypeMasked.exec(e.type);return t?e.type=t[1]:e.removeAttribute("type"),e}function setGlobalEval(e,t){var n=0,r=e.length;for(;n<r;n++)data_priv.set(e[n],"globalEval",!t||data_priv.get(t[n],"globalEval"))}function cloneCopyEvent(e,t){var n,r,i,s,o,u,a,f;if(t.nodeType!==1)return;if(data_priv.hasData(e)){s=data_priv.access(e),o=data_priv.set(t,s),f=s.events;if(f){delete o.handle,o.events={};for(i in f)for(n=0,r=f[i].length;n<r;n++)jQuery.event.add(t,i,f[i][n])}}data_user.hasData(e)&&(u=data_user.access(e),a=jQuery.extend({},u),data_user.set(t,a))}function getAll(e,t){var n=e.getElementsByTagName?e.getElementsByTagName(t||"*"):e.querySelectorAll?e.querySelectorAll(t||"*"):[];return t===undefined||t&&jQuery.nodeName(e,t)?jQuery.merge([e],n):n}function fixInput(e,t){var n=t.nodeName.toLowerCase();if(n==="input"&&rcheckableType.test(e.type))t.checked=e.checked;else if(n==="input"||n==="textarea")t.defaultValue=e.defaultValue}function actualDisplay(e,t){var n=jQuery(t.createElement(e)).appendTo(t.body),r=window.getDefaultComputedStyle?window.getDefaultComputedStyle(n[0]).display:jQuery.css(n[0],"display");return n.detach(),r}function defaultDisplay(e){var t=document,n=elemdisplay[e];if(!n){n=actualDisplay(e,t);if(n==="none"||!n)iframe=(iframe||jQuery("<iframe frameborder='0' width='0' height='0'/>")).appendTo(t.documentElement),t=iframe[0].contentDocument,t.write(),t.close(),n=actualDisplay(e,t),iframe.detach();elemdisplay[e]=n}return n}function curCSS(e,t,n){var r,i,s,o,u=e.style;return n=n||getStyles(e),n&&(o=n.getPropertyValue(t)||n[t]),n&&(o===""&&!jQuery.contains(e.ownerDocument,e)&&(o=jQuery.style(e,t)),rnumnonpx.test(o)&&rmargin.test(t)&&(r=u.width,i=u.minWidth,s=u.maxWidth,u.minWidth=u.maxWidth=u.width=o,o=n.width,u.width=r,u.minWidth=i,u.maxWidth=s)),o!==undefined?o+"":o}function addGetHookIf(e,t){return{get:function(){if(e()){delete this.get;return}return(this.get=t).apply(this,arguments)}}}function vendorPropName(e,t){if(t in e)return t;var n=t[0].toUpperCase()+t.slice(1),r=t,i=cssPrefixes.length;while(i--){t=cssPrefixes[i]+n;if(t in e)return t}return r}function setPositiveNumber(e,t,n){var r=rnumsplit.exec(t);return r?Math.max(0,r[1]-(n||0))+(r[2]||"px"):t}function augmentWidthOrHeight(e,t,n,r,i){var s=n===(r?"border":"content")?4:t==="width"?1:0,o=0;for(;s<4;s+=2)n==="margin"&&(o+=jQuery.css(e,n+cssExpand[s],!0,i)),r?(n==="content"&&(o-=jQuery.css(e,"padding"+cssExpand[s],!0,i)),n!=="margin"&&(o-=jQuery.css(e,"border"+cssExpand[s]+"Width",!0,i))):(o+=jQuery.css(e,"padding"+cssExpand[s],!0,i),n!=="padding"&&(o+=jQuery.css(e,"border"+cssExpand[s]+"Width",!0,i)));return o}function getWidthOrHeight(e,t,n){var r=!0,i=t==="width"?e.offsetWidth:e.offsetHeight,s=getStyles(e),o=jQuery.css(e,"boxSizing",!1,s)==="border-box";if(i<=0||i==null){i=curCSS(e,t,s);if(i<0||i==null)i=e.style[t];if(rnumnonpx.test(i))return i;r=o&&(support.boxSizingReliable()||i===e.style[t]),i=parseFloat(i)||0}return i+augmentWidthOrHeight(e,t,n||(o?"border":"content"),r,s)+"px"}function showHide(e,t){var n,r,i,s=[],o=0,u=e.length;for(;o<u;o++){r=e[o];if(!r.style)continue;s[o]=data_priv.get(r,"olddisplay"),n=r.style.display,t?(!s[o]&&n==="none"&&(r.style.display=""),r.style.display===""&&isHidden(r)&&(s[o]=data_priv.access(r,"olddisplay",defaultDisplay(r.nodeName)))):s[o]||(i=isHidden(r),(n&&n!=="none"||!i)&&data_priv.set(r,"olddisplay",i?n:jQuery.css(r,"display")))}for(o=0;o<u;o++){r=e[o];if(!r.style)continue;if(!t||r.style.display==="none"||r.style.display==="")r.style.display=t?s[o]||"":"none"}return e}function Tween(e,t,n,r,i){return new Tween.prototype.init(e,t,n,r,i)}function createFxNow(){return setTimeout(function(){fxNow=undefined}),fxNow=jQuery.now()}function genFx(e,t){var n,r=0,i={height:e};t=t?1:0;for(;r<4;r+=2-t)n=cssExpand[r],i["margin"+n]=i["padding"+n]=e;return t&&(i.opacity=i.width=e),i}function createTween(e,t,n){var r,i=(tweeners[t]||[]).concat(tweeners["*"]),s=0,o=i.length;for(;s<o;s++)if(r=i[s].call(n,t,e))return r}function defaultPrefilter(e,t,n){var r,i,s,o,u,a,f,l=this,c={},h=e.style,p=e.nodeType&&isHidden(e),d=data_priv.get(e,"fxshow");n.queue||(u=jQuery._queueHooks(e,"fx"),u.unqueued==null&&(u.unqueued=0,a=u.empty.fire,u.empty.fire=function(){u.unqueued||a()}),u.unqueued++,l.always(function(){l.always(function(){u.unqueued--,jQuery.queue(e,"fx").length||u.empty.fire()})})),e.nodeType===1&&("height"in t||"width"in t)&&(n.overflow=[h.overflow,h.overflowX,h.overflowY],f=jQuery.css(e,"display"),f==="none"&&(f=defaultDisplay(e.nodeName)),f==="inline"&&jQuery.css(e,"float")==="none"&&(h.display="inline-block")),n.overflow&&(h.overflow="hidden",l.always(function(){h.overflow=n.overflow[0],h.overflowX=n.overflow[1],h.overflowY=n.overflow[2]}));for(r in t){i=t[r];if(rfxtypes.exec(i)){delete t[r],s=s||i==="toggle";if(i===(p?"hide":"show")){if(i!=="show"||!d||d[r]===undefined)continue;p=!0}c[r]=d&&d[r]||jQuery.style(e,r)}}if(!jQuery.isEmptyObject(c)){d?"hidden"in d&&(p=d.hidden):d=data_priv.access(e,"fxshow",{}),s&&(d.hidden=!p),p?jQuery(e).show():l.done(function(){jQuery(e).hide()}),l.done(function(){var t;data_priv.remove(e,"fxshow");for(t in c)jQuery.style(e,t,c[t])});for(r in c)o=createTween(p?d[r]:0,r,l),r in d||(d[r]=o.start,p&&(o.end=o.start,o.start=r==="width"||r==="height"?1:0))}}function propFilter(e,t){var n,r,i,s,o;for(n in e){r=jQuery.camelCase(n),i=t[r],s=e[n],jQuery.isArray(s)&&(i=s[1],s=e[n]=s[0]),n!==r&&(e[r]=s,delete e[n]),o=jQuery.cssHooks[r];if(o&&"expand"in o){s=o.expand(s),delete e[r];for(n in s)n in e||(e[n]=s[n],t[n]=i)}else t[r]=i}}function Animation(e,t,n){var r,i,s=0,o=animationPrefilters.length,u=jQuery.Deferred().always(function(){delete a.elem}),a=function(){if(i)return!1;var t=fxNow||createFxNow(),n=Math.max(0,f.startTime+f.duration-t),r=n/f.duration||0,s=1-r,o=0,a=f.tweens.length;for(;o<a;o++)f.tweens[o].run(s);return u.notifyWith(e,[f,s,n]),s<1&&a?n:(u.resolveWith(e,[f]),!1)},f=u.promise({elem:e,props:jQuery.extend({},t),opts:jQuery.extend(!0,{specialEasing:{}},n),originalProperties:t,originalOptions:n,startTime:fxNow||createFxNow(),duration:n.duration,tweens:[],createTween:function(t,n){var r=jQuery.Tween(e,f.opts,t,n,f.opts.specialEasing[t]||f.opts.easing);return f.tweens.push(r),r},stop:function(t){var n=0,r=t?f.tweens.length:0;if(i)return this;i=!0;for(;n<r;n++)f.tweens[n].run(1);return t?u.resolveWith(e,[f,t]):u.rejectWith(e,[f,t]),this}}),l=f.props;propFilter(l,f.opts.specialEasing);for(;s<o;s++){r=animationPrefilters[s].call(f,e,l,f.opts);if(r)return r}return jQuery.map(l,createTween,f),jQuery.isFunction(f.opts.start)&&f.opts.start.call(e,f),jQuery.fx.timer(jQuery.extend(a,{elem:e,anim:f,queue:f.opts.queue})),f.progress(f.opts.progress).done(f.opts.done,f.opts.complete).fail(f.opts.fail).always(f.opts.always)}function addToPrefiltersOrTransports(e){return function(t,n){typeof t!="string"&&(n=t,t="*");var r,i=0,s=t.toLowerCase().match(rnotwhite)||[];if(jQuery.isFunction(n))while(r=s[i++])r[0]==="+"?(r=r.slice(1)||"*",(e[r]=e[r]||[]).unshift(n)):(e[r]=e[r]||[]).push(n)}}function inspectPrefiltersOrTransports(e,t,n,r){function o(u){var a;return i[u]=!0,jQuery.each(e[u]||[],function(e,u){var f=u(t,n,r);if(typeof f=="string"&&!s&&!i[f])return t.dataTypes.unshift(f),o(f),!1;if(s)return!(a=f)}),a}var i={},s=e===transports;return o(t.dataTypes[0])||!i["*"]&&o("*")}function ajaxExtend(e,t){var n,r,i=jQuery.ajaxSettings.flatOptions||{};for(n in t)t[n]!==undefined&&((i[n]?e:r||(r={}))[n]=t[n]);return r&&jQuery.extend(!0,e,r),e}function ajaxHandleResponses(e,t,n){var r,i,s,o,u=e.contents,a=e.dataTypes;while(a[0]==="*")a.shift(),r===undefined&&(r=e.mimeType||t.getResponseHeader("Content-Type"));if(r)for(i in u)if(u[i]&&u[i].test(r)){a.unshift(i);break}if(a[0]in n)s=a[0];else{for(i in n){if(!a[0]||e.converters[i+" "+a[0]]){s=i;break}o||(o=i)}s=s||o}if(s)return s!==a[0]&&a.unshift(s),n[s]}function ajaxConvert(e,t,n,r){var i,s,o,u,a,f={},l=e.dataTypes.slice();if(l[1])for(o in e.converters)f[o.toLowerCase()]=e.converters[o];s=l.shift();while(s){e.responseFields[s]&&(n[e.responseFields[s]]=t),!a&&r&&e.dataFilter&&(t=e.dataFilter(t,e.dataType)),a=s,s=l.shift();if(s)if(s==="*")s=a;else if(a!=="*"&&a!==s){o=f[a+" "+s]||f["* "+s];if(!o)for(i in f){u=i.split(" ");if(u[1]===s){o=f[a+" "+u[0]]||f["* "+u[0]];if(o){o===!0?o=f[i]:f[i]!==!0&&(s=u[0],l.unshift(u[1]));break}}}if(o!==!0)if(o&&e["throws"])t=o(t);else try{t=o(t)}catch(c){return{state:"parsererror",error:o?c:"No conversion from "+a+" to "+s}}}}return{state:"success",data:t}}function buildParams(e,t,n,r){var i;if(jQuery.isArray(t))jQuery.each(t,function(t,i){n||rbracket.test(e)?r(e,i):buildParams(e+"["+(typeof i=="object"?t:"")+"]",i,n,r)});else if(!n&&jQuery.type(t)==="object")for(i in t)buildParams(e+"["+i+"]",t[i],n,r);else r(e,t)}function getWindow(e){return jQuery.isWindow(e)?e:e.nodeType===9&&e.defaultView}var arr=[],slice=arr.slice,concat=arr.concat,push=arr.push,indexOf=arr.indexOf,class2type={},toString=class2type.toString,hasOwn=class2type.hasOwnProperty,trim="".trim,support={},document=window.document,version="2.1.0",jQuery=function(e,t){return new jQuery.fn.init(e,t)},rmsPrefix=/^-ms-/,rdashAlpha=/-([\da-z])/gi,fcamelCase=function(e,t){return t.toUpperCase()};jQuery.fn=jQuery.prototype={jquery:version,constructor:jQuery,selector:"",length:0,toArray:function(){return slice.call(this)},get:function(e){return e!=null?e<0?this[e+this.length]:this[e]:slice.call(this)},pushStack:function(e){var t=jQuery.merge(this.constructor(),e);return t.prevObject=this,t.context=this.context,t},each:function(e,t){return jQuery.each(this,e,t)},map:function(e){return this.pushStack(jQuery.map(this,function(t,n){return e.call(t,n,t)}))},slice:function(){return this.pushStack(slice.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(e){var t=this.length,n=+e+(e<0?t:0);return this.pushStack(n>=0&&n<t?[this[n]]:[])},end:function(){return this.prevObject||this.constructor(null)},push:push,sort:arr.sort,splice:arr.splice},jQuery.extend=jQuery.fn.extend=function(){var e,t,n,r,i,s,o=arguments[0]||{},u=1,a=arguments.length,f=!1;typeof o=="boolean"&&(f=o,o=arguments[u]||{},u++),typeof o!="object"&&!jQuery.isFunction(o)&&(o={}),u===a&&(o=this,u--);for(;u<a;u++)if((e=arguments[u])!=null)for(t in e){n=o[t],r=e[t];if(o===r)continue;f&&r&&(jQuery.isPlainObject(r)||(i=jQuery.isArray(r)))?(i?(i=!1,s=n&&jQuery.isArray(n)?n:[]):s=n&&jQuery.isPlainObject(n)?n:{},o[t]=jQuery.extend(f,s,r)):r!==undefined&&(o[t]=r)}return o},jQuery.extend({expando:"jQuery"+(version+Math.random()).replace(/\D/g,""),isReady:!0,error:function(e){throw new Error(e)},noop:function(){},isFunction:function(e){return jQuery.type(e)==="function"},isArray:Array.isArray,isWindow:function(e){return e!=null&&e===e.window},isNumeric:function(e){return e-parseFloat(e)>=0},isPlainObject:function(e){if(jQuery.type(e)!=="object"||e.nodeType||jQuery.isWindow(e))return!1;try{if(e.constructor&&!hasOwn.call(e.constructor.prototype,"isPrototypeOf"))return!1}catch(t){return!1}return!0},isEmptyObject:function(e){var t;for(t in e)return!1;return!0},type:function(e){return e==null?e+"":typeof e=="object"||typeof e=="function"?class2type[toString.call(e)]||"object":typeof e},globalEval:function(code){var script,indirect=eval;code=jQuery.trim(code),code&&(code.indexOf("use strict")===1?(script=document.createElement("script"),script.text=code,document.head.appendChild(script).parentNode.removeChild(script)):indirect(code))},camelCase:function(e){return e.replace(rmsPrefix,"ms-").replace(rdashAlpha,fcamelCase)},nodeName:function(e,t){return e.nodeName&&e.nodeName.toLowerCase()===t.toLowerCase()},each:function(e,t,n){var r,i=0,s=e.length,o=isArraylike(e);if(n)if(o)for(;i<s;i++){r=t.apply(e[i],n);if(r===!1)break}else for(i in e){r=t.apply(e[i],n);if(r===!1)break}else if(o)for(;i<s;i++){r=t.call(e[i],i,e[i]);if(r===!1)break}else for(i in e){r=t.call(e[i],i,e[i]);if(r===!1)break}return e},trim:function(e){return e==null?"":trim.call(e)},makeArray:function(e,t){var n=t||[];return e!=null&&(isArraylike(Object(e))?jQuery.merge(n,typeof e=="string"?[e]:e):push.call(n,e)),n},inArray:function(e,t,n){return t==null?-1:indexOf.call(t,e,n)},merge:function(e,t){var n=+t.length,r=0,i=e.length;for(;r<n;r++)e[i++]=t[r];return e.length=i,e},grep:function(e,t,n){var r,i=[],s=0,o=e.length,u=!n;for(;s<o;s++)r=!t(e[s],s),r!==u&&i.push(e[s]);return i},map:function(e,t,n){var r,i=0,s=e.length,o=isArraylike(e),u=[];if(o)for(;i<s;i++)r=t(e[i],i,n),r!=null&&u.push(r);else for(i in e)r=t(e[i],i,n),r!=null&&u.push(r);return concat.apply([],u)},guid:1,proxy:function(e,t){var n,r,i;return typeof t=="string"&&(n=e[t],t=e,e=n),jQuery.isFunction(e)?(r=slice.call(arguments,2),i=function(){return e.apply(t||this,r.concat(slice.call(arguments)))},i.guid=e.guid=e.guid||jQuery.guid++,i):undefined},now:Date.now,support:support}),jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(e,t){class2type["[object "+t+"]"]=t.toLowerCase()});var Sizzle=function(e){function rt(e,t,r,i){var s,o,u,a,f,h,v,m,w,E;(t?t.ownerDocument||t:b)!==c&&l(t),t=t||c,r=r||[];if(!e||typeof e!="string")return r;if((a=t.nodeType)!==1&&a!==9)return[];if(p&&!i){if(s=G.exec(e))if(u=s[1]){if(a===9){o=t.getElementById(u);if(!o||!o.parentNode)return r;if(o.id===u)return r.push(o),r}else if(t.ownerDocument&&(o=t.ownerDocument.getElementById(u))&&g(t,o)&&o.id===u)return r.push(o),r}else{if(s[2])return _.apply(r,t.getElementsByTagName(e)),r;if((u=s[3])&&n.getElementsByClassName&&t.getElementsByClassName)return _.apply(r,t.getElementsByClassName(u)),r}if(n.qsa&&(!d||!d.test(e))){m=v=y,w=t,E=a===9&&e;if(a===1&&t.nodeName.toLowerCase()!=="object"){h=dt(e),(v=t.getAttribute("id"))?m=v.replace(Z,"\\$&"):t.setAttribute("id",m),m="[id='"+m+"'] ",f=h.length;while(f--)h[f]=m+vt(h[f]);w=Y.test(e)&&ht(t.parentNode)||t,E=h.join(",")}if(E)try{return _.apply(r,w.querySelectorAll(E)),r}catch(S){}finally{v||t.removeAttribute("id")}}}return xt(e.replace(R,"$1"),t,r,i)}function it(){function t(n,i){return e.push(n+" ")>r.cacheLength&&delete t[e.shift()],t[n+" "]=i}var e=[];return t}function st(e){return e[y]=!0,e}function ot(e){var t=c.createElement("div");try{return!!e(t)}catch(n){return!1}finally{t.parentNode&&t.parentNode.removeChild(t),t=null}}function ut(e,t){var n=e.split("|"),i=e.length;while(i--)r.attrHandle[n[i]]=t}function at(e,t){var n=t&&e,r=n&&e.nodeType===1&&t.nodeType===1&&(~t.sourceIndex||k)-(~e.sourceIndex||k);if(r)return r;if(n)while(n=n.nextSibling)if(n===t)return-1;return e?1:-1}function ft(e){return function(t){var n=t.nodeName.toLowerCase();return n==="input"&&t.type===e}}function lt(e){return function(t){var n=t.nodeName.toLowerCase();return(n==="input"||n==="button")&&t.type===e}}function ct(e){return st(function(t){return t=+t,st(function(n,r){var i,s=e([],n.length,t),o=s.length;while(o--)n[i=s[o]]&&(n[i]=!(r[i]=n[i]))})})}function ht(e){return e&&typeof e.getElementsByTagName!==C&&e}function pt(){}function dt(e,t){var n,i,s,o,u,a,f,l=x[e+" "];if(l)return t?0:l.slice(0);u=e,a=[],f=r.preFilter;while(u){if(!n||(i=U.exec(u)))i&&(u=u.slice(i[0].length)||u),a.push(s=[]);n=!1;if(i=z.exec(u))n=i.shift(),s.push({value:n,type:i[0].replace(R," ")}),u=u.slice(n.length);for(o in r.filter)(i=$[o].exec(u))&&(!f[o]||(i=f[o](i)))&&(n=i.shift(),s.push({value:n,type:o,matches:i}),u=u.slice(n.length));if(!n)break}return t?u.length:u?rt.error(e):x(e,a).slice(0)}function vt(e){var t=0,n=e.length,r="";for(;t<n;t++)r+=e[t].value;return r}function mt(e,t,n){var r=t.dir,i=n&&r==="parentNode",s=E++;return t.first?function(t,n,s){while(t=t[r])if(t.nodeType===1||i)return e(t,n,s)}:function(t,n,o){var u,a,f=[w,s];if(o){while(t=t[r])if(t.nodeType===1||i)if(e(t,n,o))return!0}else while(t=t[r])if(t.nodeType===1||i){a=t[y]||(t[y]={});if((u=a[r])&&u[0]===w&&u[1]===s)return f[2]=u[2];a[r]=f;if(f[2]=e(t,n,o))return!0}}}function gt(e){return e.length>1?function(t,n,r){var i=e.length;while(i--)if(!e[i](t,n,r))return!1;return!0}:e[0]}function yt(e,t,n,r,i){var s,o=[],u=0,a=e.length,f=t!=null;for(;u<a;u++)if(s=e[u])if(!n||n(s,r,i))o.push(s),f&&t.push(u);return o}function bt(e,t,n,r,i,s){return r&&!r[y]&&(r=bt(r)),i&&!i[y]&&(i=bt(i,s)),st(function(s,o,u,a){var f,l,c,h=[],p=[],d=o.length,v=s||St(t||"*",u.nodeType?[u]:u,[]),m=e&&(s||!t)?yt(v,h,e,u,a):v,g=n?i||(s?e:d||r)?[]:o:m;n&&n(m,g,u,a);if(r){f=yt(g,p),r(f,[],u,a),l=f.length;while(l--)if(c=f[l])g[p[l]]=!(m[p[l]]=c)}if(s){if(i||e){if(i){f=[],l=g.length;while(l--)(c=g[l])&&f.push(m[l]=c);i(null,g=[],f,a)}l=g.length;while(l--)(c=g[l])&&(f=i?P.call(s,c):h[l])>-1&&(s[f]=!(o[f]=c))}}else g=yt(g===o?g.splice(d,g.length):g),i?i(null,o,g,a):_.apply(o,g)})}function wt(e){var t,n,i,s=e.length,o=r.relative[e[0].type],a=o||r.relative[" "],f=o?1:0,l=mt(function(e){return e===t},a,!0),c=mt(function(e){return P.call(t,e)>-1},a,!0),h=[function(e,n,r){return!o&&(r||n!==u)||((t=n).nodeType?l(e,n,r):c(e,n,r))}];for(;f<s;f++)if(n=r.relative[e[f].type])h=[mt(gt(h),n)];else{n=r.filter[e[f].type].apply(null,e[f].matches);if(n[y]){i=++f;for(;i<s;i++)if(r.relative[e[i].type])break;return bt(f>1&&gt(h),f>1&&vt(e.slice(0,f-1).concat({value:e[f-2].type===" "?"*":""})).replace(R,"$1"),n,f<i&&wt(e.slice(f,i)),i<s&&wt(e=e.slice(i)),i<s&&vt(e))}h.push(n)}return gt(h)}function Et(e,t){var n=t.length>0,i=e.length>0,s=function(s,o,a,f,l){var h,p,d,v=0,m="0",g=s&&[],y=[],b=u,E=s||i&&r.find.TAG("*",l),S=w+=b==null?1:Math.random()||.1,x=E.length;l&&(u=o!==c&&o);for(;m!==x&&(h=E[m])!=null;m++){if(i&&h){p=0;while(d=e[p++])if(d(h,o,a)){f.push(h);break}l&&(w=S)}n&&((h=!d&&h)&&v--,s&&g.push(h))}v+=m;if(n&&m!==v){p=0;while(d=t[p++])d(g,y,o,a);if(s){if(v>0)while(m--)!g[m]&&!y[m]&&(y[m]=O.call(f));y=yt(y)}_.apply(f,y),l&&!s&&y.length>0&&v+t.length>1&&rt.uniqueSort(f)}return l&&(w=S,u=b),g};return n?st(s):s}function St(e,t,n){var r=0,i=t.length;for(;r<i;r++)rt(e,t[r],n);return n}function xt(e,t,i,s){var u,a,f,l,c,h=dt(e);if(!s&&h.length===1){a=h[0]=h[0].slice(0);if(a.length>2&&(f=a[0]).type==="ID"&&n.getById&&t.nodeType===9&&p&&r.relative[a[1].type]){t=(r.find.ID(f.matches[0].replace(et,tt),t)||[])[0];if(!t)return i;e=e.slice(a.shift().value.length)}u=$.needsContext.test(e)?0:a.length;while(u--){f=a[u];if(r.relative[l=f.type])break;if(c=r.find[l])if(s=c(f.matches[0].replace(et,tt),Y.test(a[0].type)&&ht(t.parentNode)||t)){a.splice(u,1),e=s.length&&vt(a);if(!e)return _.apply(i,s),i;break}}}return o(e,h)(s,t,!p,i,Y.test(e)&&ht(t.parentNode)||t),i}var t,n,r,i,s,o,u,a,f,l,c,h,p,d,v,m,g,y="sizzle"+ -(new Date),b=e.document,w=0,E=0,S=it(),x=it(),T=it(),N=function(e,t){return e===t&&(f=!0),0},C=typeof undefined,k=1<<31,L={}.hasOwnProperty,A=[],O=A.pop,M=A.push,_=A.push,D=A.slice,P=A.indexOf||function(e){var t=0,n=this.length;for(;t<n;t++)if(this[t]===e)return t;return-1},H="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",B="[\\x20\\t\\r\\n\\f]",j="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",F=j.replace("w","w#"),I="\\["+B+"*("+j+")"+B+"*(?:([*^$|!~]?=)"+B+"*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|("+F+")|)|)"+B+"*\\]",q=":("+j+")(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|"+I.replace(3,8)+")*)|.*)\\)|)",R=new RegExp("^"+B+"+|((?:^|[^\\\\])(?:\\\\.)*)"+B+"+$","g"),U=new RegExp("^"+B+"*,"+B+"*"),z=new RegExp("^"+B+"*([>+~]|"+B+")"+B+"*"),W=new RegExp("="+B+"*([^\\]'\"]*?)"+B+"*\\]","g"),X=new RegExp(q),V=new RegExp("^"+F+"$"),$={ID:new RegExp("^#("+j+")"),CLASS:new RegExp("^\\.("+j+")"),TAG:new RegExp("^("+j.replace("w","w*")+")"),ATTR:new RegExp("^"+I),PSEUDO:new RegExp("^"+q),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+B+"*(even|odd|(([+-]|)(\\d*)n|)"+B+"*(?:([+-]|)"+B+"*(\\d+)|))"+B+"*\\)|)","i"),bool:new RegExp("^(?:"+H+")$","i"),needsContext:new RegExp("^"+B+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+B+"*((?:-\\d)?\\d*)"+B+"*\\)|)(?=[^-]|$)","i")},J=/^(?:input|select|textarea|button)$/i,K=/^h\d$/i,Q=/^[^{]+\{\s*\[native \w/,G=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,Y=/[+~]/,Z=/'|\\/g,et=new RegExp("\\\\([\\da-f]{1,6}"+B+"?|("+B+")|.)","ig"),tt=function(e,t,n){var r="0x"+t-65536;return r!==r||n?t:r<0?String.fromCharCode(r+65536):String.fromCharCode(r>>10|55296,r&1023|56320)};try{_.apply(A=D.call(b.childNodes),b.childNodes),A[b.childNodes.length].nodeType}catch(nt){_={apply:A.length?function(e,t){M.apply(e,D.call(t))}:function(e,t){var n=e.length,r=0;while(e[n++]=t[r++]);e.length=n-1}}}n=rt.support={},s=rt.isXML=function(e){var t=e&&(e.ownerDocument||e).documentElement;return t?t.nodeName!=="HTML":!1},l=rt.setDocument=function(e){var t,i=e?e.ownerDocument||e:b,o=i.defaultView;if(i===c||i.nodeType!==9||!i.documentElement)return c;c=i,h=i.documentElement,p=!s(i),o&&o!==o.top&&(o.addEventListener?o.addEventListener("unload",function(){l()},!1):o.attachEvent&&o.attachEvent("onunload",function(){l()})),n.attributes=ot(function(e){return e.className="i",!e.getAttribute("className")}),n.getElementsByTagName=ot(function(e){return e.appendChild(i.createComment("")),!e.getElementsByTagName("*").length}),n.getElementsByClassName=Q.test(i.getElementsByClassName)&&ot(function(e){return e.innerHTML="<div class='a'></div><div class='a i'></div>",e.firstChild.className="i",e.getElementsByClassName("i").length===2}),n.getById=ot(function(e){return h.appendChild(e).id=y,!i.getElementsByName||!i.getElementsByName(y).length}),n.getById?(r.find.ID=function(e,t){if(typeof t.getElementById!==C&&p){var n=t.getElementById(e);return n&&n.parentNode?[n]:[]}},r.filter.ID=function(e){var t=e.replace(et,tt);return function(e){return e.getAttribute("id")===t}}):(delete r.find.ID,r.filter.ID=function(e){var t=e.replace(et,tt);return function(e){var n=typeof e.getAttributeNode!==C&&e.getAttributeNode("id");return n&&n.value===t}}),r.find.TAG=n.getElementsByTagName?function(e,t){if(typeof t.getElementsByTagName!==C)return t.getElementsByTagName(e)}:function(e,t){var n,r=[],i=0,s=t.getElementsByTagName(e);if(e==="*"){while(n=s[i++])n.nodeType===1&&r.push(n);return r}return s},r.find.CLASS=n.getElementsByClassName&&function(e,t){if(typeof t.getElementsByClassName!==C&&p)return t.getElementsByClassName(e)},v=[],d=[];if(n.qsa=Q.test(i.querySelectorAll))ot(function(e){e.innerHTML="<select t=''><option selected=''></option></select>",e.querySelectorAll("[t^='']").length&&d.push("[*^$]="+B+"*(?:''|\"\")"),e.querySelectorAll("[selected]").length||d.push("\\["+B+"*(?:value|"+H+")"),e.querySelectorAll(":checked").length||d.push(":checked")}),ot(function(e){var t=i.createElement("input");t.setAttribute("type","hidden"),e.appendChild(t).setAttribute("name","D"),e.querySelectorAll("[name=d]").length&&d.push("name"+B+"*[*^$|!~]?="),e.querySelectorAll(":enabled").length||d.push(":enabled",":disabled"),e.querySelectorAll("*,:x"),d.push(",.*:")});return(n.matchesSelector=Q.test(m=h.webkitMatchesSelector||h.mozMatchesSelector||h.oMatchesSelector||h.msMatchesSelector))&&ot(function(e){n.disconnectedMatch=m.call(e,"div"),m.call(e,"[s!='']:x"),v.push("!=",q)}),d=d.length&&new RegExp(d.join("|")),v=v.length&&new RegExp(v.join("|")),t=Q.test(h.compareDocumentPosition),g=t||Q.test(h.contains)?function(e,t){var n=e.nodeType===9?e.documentElement:e,r=t&&t.parentNode;return e===r||!!r&&r.nodeType===1&&!!(n.contains?n.contains(r):e.compareDocumentPosition&&e.compareDocumentPosition(r)&16)}:function(e,t){if(t)while(t=t.parentNode)if(t===e)return!0;return!1},N=t?function(e,t){if(e===t)return f=!0,0;var r=!e.compareDocumentPosition-!t.compareDocumentPosition;return r?r:(r=(e.ownerDocument||e)===(t.ownerDocument||t)?e.compareDocumentPosition(t):1,r&1||!n.sortDetached&&t.compareDocumentPosition(e)===r?e===i||e.ownerDocument===b&&g(b,e)?-1:t===i||t.ownerDocument===b&&g(b,t)?1:a?P.call(a,e)-P.call(a,t):0:r&4?-1:1)}:function(e,t){if(e===t)return f=!0,0;var n,r=0,s=e.parentNode,o=t.parentNode,u=[e],l=[t];if(!s||!o)return e===i?-1:t===i?1:s?-1:o?1:a?P.call(a,e)-P.call(a,t):0;if(s===o)return at(e,t);n=e;while(n=n.parentNode)u.unshift(n);n=t;while(n=n.parentNode)l.unshift(n);while(u[r]===l[r])r++;return r?at(u[r],l[r]):u[r]===b?-1:l[r]===b?1:0},i},rt.matches=function(e,t){return rt(e,null,null,t)},rt.matchesSelector=function(e,t){(e.ownerDocument||e)!==c&&l(e),t=t.replace(W,"='$1']");if(n.matchesSelector&&p&&(!v||!v.test(t))&&(!d||!d.test(t)))try{var r=m.call(e,t);if(r||n.disconnectedMatch||e.document&&e.document.nodeType!==11)return r}catch(i){}return rt(t,c,null,[e]).length>0},rt.contains=function(e,t){return(e.ownerDocument||e)!==c&&l(e),g(e,t)},rt.attr=function(e,t){(e.ownerDocument||e)!==c&&l(e);var i=r.attrHandle[t.toLowerCase()],s=i&&L.call(r.attrHandle,t.toLowerCase())?i(e,t,!p):undefined;return s!==undefined?s:n.attributes||!p?e.getAttribute(t):(s=e.getAttributeNode(t))&&s.specified?s.value:null},rt.error=function(e){throw new Error("Syntax error, unrecognized expression: "+e)},rt.uniqueSort=function(e){var t,r=[],i=0,s=0;f=!n.detectDuplicates,a=!n.sortStable&&e.slice(0),e.sort(N);if(f){while(t=e[s++])t===e[s]&&(i=r.push(s));while(i--)e.splice(r[i],1)}return a=null,e},i=rt.getText=function(e){var t,n="",r=0,s=e.nodeType;if(!s)while(t=e[r++])n+=i(t);else if(s===1||s===9||s===11){if(typeof e.textContent=="string")return e.textContent;for(e=e.firstChild;e;e=e.nextSibling)n+=i(e)}else if(s===3||s===4)return e.nodeValue;return n},r=rt.selectors={cacheLength:50,createPseudo:st,match:$,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(e){return e[1]=e[1].replace(et,tt),e[3]=(e[4]||e[5]||"").replace(et,tt),e[2]==="~="&&(e[3]=" "+e[3]+" "),e.slice(0,4)},CHILD:function(e){return e[1]=e[1].toLowerCase(),e[1].slice(0,3)==="nth"?(e[3]||rt.error(e[0]),e[4]=+(e[4]?e[5]+(e[6]||1):2*(e[3]==="even"||e[3]==="odd")),e[5]=+(e[7]+e[8]||e[3]==="odd")):e[3]&&rt.error(e[0]),e},PSEUDO:function(e){var t,n=!e[5]&&e[2];return $.CHILD.test(e[0])?null:(e[3]&&e[4]!==undefined?e[2]=e[4]:n&&X.test(n)&&(t=dt(n,!0))&&(t=n.indexOf(")",n.length-t)-n.length)&&(e[0]=e[0].slice(0,t),e[2]=n.slice(0,t)),e.slice(0,3))}},filter:{TAG:function(e){var t=e.replace(et,tt).toLowerCase();return e==="*"?function(){return!0}:function(e){return e.nodeName&&e.nodeName.toLowerCase()===t}},CLASS:function(e){var t=S[e+" "];return t||(t=new RegExp("(^|"+B+")"+e+"("+B+"|$)"))&&S(e,function(e){return t.test(typeof e.className=="string"&&e.className||typeof e.getAttribute!==C&&e.getAttribute("class")||"")})},ATTR:function(e,t,n){return function(r){var i=rt.attr(r,e);return i==null?t==="!=":t?(i+="",t==="="?i===n:t==="!="?i!==n:t==="^="?n&&i.indexOf(n)===0:t==="*="?n&&i.indexOf(n)>-1:t==="$="?n&&i.slice(-n.length)===n:t==="~="?(" "+i+" ").indexOf(n)>-1:t==="|="?i===n||i.slice(0,n.length+1)===n+"-":!1):!0}},CHILD:function(e,t,n,r,i){var s=e.slice(0,3)!=="nth",o=e.slice(-4)!=="last",u=t==="of-type";return r===1&&i===0?function(e){return!!e.parentNode}:function(t,n,a){var f,l,c,h,p,d,v=s!==o?"nextSibling":"previousSibling",m=t.parentNode,g=u&&t.nodeName.toLowerCase(),b=!a&&!u;if(m){if(s){while(v){c=t;while(c=c[v])if(u?c.nodeName.toLowerCase()===g:c.nodeType===1)return!1;d=v=e==="only"&&!d&&"nextSibling"}return!0}d=[o?m.firstChild:m.lastChild];if(o&&b){l=m[y]||(m[y]={}),f=l[e]||[],p=f[0]===w&&f[1],h=f[0]===w&&f[2],c=p&&m.childNodes[p];while(c=++p&&c&&c[v]||(h=p=0)||d.pop())if(c.nodeType===1&&++h&&c===t){l[e]=[w,p,h];break}}else if(b&&(f=(t[y]||(t[y]={}))[e])&&f[0]===w)h=f[1];else while(c=++p&&c&&c[v]||(h=p=0)||d.pop())if((u?c.nodeName.toLowerCase()===g:c.nodeType===1)&&++h){b&&((c[y]||(c[y]={}))[e]=[w,h]);if(c===t)break}return h-=i,h===r||h%r===0&&h/r>=0}}},PSEUDO:function(e,t){var n,i=r.pseudos[e]||r.setFilters[e.toLowerCase()]||rt.error("unsupported pseudo: "+e);return i[y]?i(t):i.length>1?(n=[e,e,"",t],r.setFilters.hasOwnProperty(e.toLowerCase())?st(function(e,n){var r,s=i(e,t),o=s.length;while(o--)r=P.call(e,s[o]),e[r]=!(n[r]=s[o])}):function(e){return i(e,0,n)}):i}},pseudos:{not:st(function(e){var t=[],n=[],r=o(e.replace(R,"$1"));return r[y]?st(function(e,t,n,i){var s,o=r(e,null,i,[]),u=e.length;while(u--)if(s=o[u])e[u]=!(t[u]=s)}):function(e,i,s){return t[0]=e,r(t,null,s,n),!n.pop()}}),has:st(function(e){return function(t){return rt(e,t).length>0}}),contains:st(function(e){return function(t){return(t.textContent||t.innerText||i(t)).indexOf(e)>-1}}),lang:st(function(e){return V.test(e||"")||rt.error("unsupported lang: "+e),e=e.replace(et,tt).toLowerCase(),function(t){var n;do if(n=p?t.lang:t.getAttribute("xml:lang")||t.getAttribute("lang"))return n=n.toLowerCase(),n===e||n.indexOf(e+"-")===0;while((t=t.parentNode)&&t.nodeType===1);return!1}}),target:function(t){var n=e.location&&e.location.hash;return n&&n.slice(1)===t.id},root:function(e){return e===h},focus:function(e){return e===c.activeElement&&(!c.hasFocus||c.hasFocus())&&!!(e.type||e.href||~e.tabIndex)},enabled:function(e){return e.disabled===!1},disabled:function(e){return e.disabled===!0},checked:function(e){var t=e.nodeName.toLowerCase();return t==="input"&&!!e.checked||t==="option"&&!!e.selected},selected:function(e){return e.parentNode&&e.parentNode.selectedIndex,e.selected===!0},empty:function(e){for(e=e.firstChild;e;e=e.nextSibling)if(e.nodeType<6)return!1;return!0},parent:function(e){return!r.pseudos.empty(e)},header:function(e){return K.test(e.nodeName)},input:function(e){return J.test(e.nodeName)},button:function(e){var t=e.nodeName.toLowerCase();return t==="input"&&e.type==="button"||t==="button"},text:function(e){var t;return e.nodeName.toLowerCase()==="input"&&e.type==="text"&&((t=e.getAttribute("type"))==null||t.toLowerCase()==="text")},first:ct(function(){return[0]}),last:ct(function(e,t){return[t-1]}),eq:ct(function(e,t,n){return[n<0?n+t:n]}),even:ct(function(e,t){var n=0;for(;n<t;n+=2)e.push(n);return e}),odd:ct(function(e,t){var n=1;for(;n<t;n+=2)e.push(n);return e}),lt:ct(function(e,t,n){var r=n<0?n+t:n;for(;--r>=0;)e.push(r);return e}),gt:ct(function(e,t,n){var r=n<0?n+t:n;for(;++r<t;)e.push(r);return e})}},r.pseudos.nth=r.pseudos.eq;for(t in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})r.pseudos[t]=ft(t);for(t in{submit:!0,reset:!0})r.pseudos[t]=lt(t);return pt.prototype=r.filters=r.pseudos,r.setFilters=new pt,o=rt.compile=function(e,t){var n,r=[],i=[],s=T[e+" "];if(!s){t||(t=dt(e)),n=t.length;while(n--)s=wt(t[n]),s[y]?r.push(s):i.push(s);s=T(e,Et(i,r))}return s},n.sortStable=y.split("").sort(N).join("")===y,n.detectDuplicates=!!f,l(),n.sortDetached=ot(function(e){return e.compareDocumentPosition(c.createElement("div"))&1}),ot(function(e){return e.innerHTML="<a href='#'></a>",e.firstChild.getAttribute("href")==="#"})||ut("type|href|height|width",function(e,t,n){if(!n)return e.getAttribute(t,t.toLowerCase()==="type"?1:2)}),(!n.attributes||!ot(function(e){return e.innerHTML="<input/>",e.firstChild.setAttribute("value",""),e.firstChild.getAttribute("value")===""}))&&ut("value",function(e,t,n){if(!n&&e.nodeName.toLowerCase()==="input")return e.defaultValue}),ot(function(e){return e.getAttribute("disabled")==null})||ut(H,function(e,t,n){var r;if(!n)return e[t]===!0?t.toLowerCase():(r=e.getAttributeNode(t))&&r.specified?r.value:null}),rt}(window);jQuery.find=Sizzle,jQuery.expr=Sizzle.selectors,jQuery.expr[":"]=jQuery.expr.pseudos,jQuery.unique=Sizzle.uniqueSort,jQuery.text=Sizzle.getText,jQuery.isXMLDoc=Sizzle.isXML,jQuery.contains=Sizzle.contains;var rneedsContext=jQuery.expr.match.needsContext,rsingleTag=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,risSimple=/^.[^:#\[\.,]*$/;jQuery.filter=function(e,t,n){var r=t[0];return n&&(e=":not("+e+")"),t.length===1&&r.nodeType===1?jQuery.find.matchesSelector(r,e)?[r]:[]:jQuery.find.matches(e,jQuery.grep(t,function(e){return e.nodeType===1}))},jQuery.fn.extend({find:function(e){var t,n=this.length,r=[],i=this;if(typeof e!="string")return this.pushStack(jQuery(e).filter(function(){for(t=0;t<n;t++)if(jQuery.contains(i[t],this))return!0}));for(t=0;t<n;t++)jQuery.find(e,i[t],r);return r=this.pushStack(n>1?jQuery.unique(r):r),r.selector=this.selector?this.selector+" "+e:e,r},filter:function(e){return this.pushStack(winnow(this,e||[],!1))},not:function(e){return this.pushStack(winnow(this,e||[],!0))},is:function(e){return!!winnow(this,typeof e=="string"&&rneedsContext.test(e)?jQuery(e):e||[],!1).length}});var rootjQuery,rquickExpr=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,init=jQuery.fn.init=function(e,t){var n,r;if(!e)return this;if(typeof e=="string"){e[0]==="<"&&e[e.length-1]===">"&&e.length>=3?n=[null,e,null]:n=rquickExpr.exec(e);if(n&&(n[1]||!t)){if(n[1]){t=t instanceof jQuery?t[0]:t,jQuery.merge(this,jQuery.parseHTML(n[1],t&&t.nodeType?t.ownerDocument||t:document,!0));if(rsingleTag.test(n[1])&&jQuery.isPlainObject(t))for(n in t)jQuery.isFunction(this[n])?this[n](t[n]):this.attr(n,t[n]);return this}return r=document.getElementById(n[2]),r&&r.parentNode&&(this.length=1,this[0]=r),this.context=document,this.selector=e,this}return!t||t.jquery?(t||rootjQuery).find(e):this.constructor(t).find(e)}return e.nodeType?(this.context=this[0]=e,this.length=1,this):jQuery.isFunction(e)?typeof rootjQuery.ready!="undefined"?rootjQuery.ready(e):e(jQuery):(e.selector!==undefined&&(this.selector=e.selector,this.context=e.context),jQuery.makeArray(e,this))};init.prototype=jQuery.fn,rootjQuery=jQuery(document);var rparentsprev=/^(?:parents|prev(?:Until|All))/,guaranteedUnique={children:!0,contents:!0,next:!0,prev:!0};jQuery.extend({dir:function(e,t,n){var r=[],i=n!==undefined;while((e=e[t])&&e.nodeType!==9)if(e.nodeType===1){if(i&&jQuery(e).is(n))break;r.push(e)}return r},sibling:function(e,t){var n=[];for(;e;e=e.nextSibling)e.nodeType===1&&e!==t&&n.push(e);return n}}),jQuery.fn.extend({has:function(e){var t=jQuery(e,this),n=t.length;return this.filter(function(){var e=0;for(;e<n;e++)if(jQuery.contains(this,t[e]))return!0})},closest:function(e,t){var n,r=0,i=this.length,s=[],o=rneedsContext.test(e)||typeof e!="string"?jQuery(e,t||this.context):0;for(;r<i;r++)for(n=this[r];n&&n!==t;n=n.parentNode)if(n.nodeType<11&&(o?o.index(n)>-1:n.nodeType===1&&jQuery.find.matchesSelector(n,e))){s.push(n);break}return this.pushStack(s.length>1?jQuery.unique(s):s)},index:function(e){return e?typeof e=="string"?indexOf.call(jQuery(e),this[0]):indexOf.call(this,e.jquery?e[0]:e):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(e,t){return this.pushStack(jQuery.unique(jQuery.merge(this.get(),jQuery(e,t))))},addBack:function(e){return this.add(e==null?this.prevObject:this.prevObject.filter(e))}}),jQuery.each({parent:function(e){var t=e.parentNode;return t&&t.nodeType!==11?t:null},parents:function(e){return jQuery.dir(e,"parentNode")},parentsUntil:function(e,t,n){return jQuery.dir(e,"parentNode",n)},next:function(e){return sibling(e,"nextSibling")},prev:function(e){return sibling(e,"previousSibling")},nextAll:function(e){return jQuery.dir(e,"nextSibling")},prevAll:function(e){return jQuery.dir(e,"previousSibling")},nextUntil:function(e,t,n){return jQuery.dir(e,"nextSibling",n)},prevUntil:function(e,t,n){return jQuery.dir(e,"previousSibling",n)},siblings:function(e){return jQuery.sibling((e.parentNode||{}).firstChild,e)},children:function(e){return jQuery.sibling(e.firstChild)},contents:function(e){return e.contentDocument||jQuery.merge([],e.childNodes)}},function(e,t){jQuery.fn[e]=function(n,r){var i=jQuery.map(this,t,n);return e.slice(-5)!=="Until"&&(r=n),r&&typeof r=="string"&&(i=jQuery.filter(r,i)),this.length>1&&(guaranteedUnique[e]||jQuery.unique(i),rparentsprev.test(e)&&i.reverse()),this.pushStack(i)}});var rnotwhite=/\S+/g,optionsCache={};jQuery.Callbacks=function(e){e=typeof e=="string"?optionsCache[e]||createOptions(e):jQuery.extend({},e);var t,n,r,i,s,o,u=[],a=!e.once&&[],f=function(c){t=e.memory&&c,n=!0,o=i||0,i=0,s=u.length,r=!0;for(;u&&o<s;o++)if(u[o].apply(c[0],c[1])===!1&&e.stopOnFalse){t=!1;break}r=!1,u&&(a?a.length&&f(a.shift()):t?u=[]:l.disable())},l={add:function(){if(u){var n=u.length;(function o(t){jQuery.each(t,function(t,n){var r=jQuery.type(n);r==="function"?(!e.unique||!l.has(n))&&u.push(n):n&&n.length&&r!=="string"&&o(n)})})(arguments),r?s=u.length:t&&(i=n,f(t))}return this},remove:function(){return u&&jQuery.each(arguments,function(e,t){var n;while((n=jQuery.inArray(t,u,n))>-1)u.splice(n,1),r&&(n<=s&&s--,n<=o&&o--)}),this},has:function(e){return e?jQuery.inArray(e,u)>-1:!!u&&!!u.length},empty:function(){return u=[],s=0,this},disable:function(){return u=a=t=undefined,this},disabled:function(){return!u},lock:function(){return a=undefined,t||l.disable(),this},locked:function(){return!a},fireWith:function(e,t){return u&&(!n||a)&&(t=t||[],t=[e,t.slice?t.slice():t],r?a.push(t):f(t)),this},fire:function(){return l.fireWith(this,arguments),this},fired:function(){return!!n}};return l},jQuery.extend({Deferred:function(e){var t=[["resolve","done",jQuery.Callbacks("once memory"),"resolved"],["reject","fail",jQuery.Callbacks("once memory"),"rejected"],["notify","progress",jQuery.Callbacks("memory")]],n="pending",r={state:function(){return n},always:function(){return i.done(arguments).fail(arguments),this},then:function(){var e=arguments;return jQuery.Deferred(function(n){jQuery.each(t,function(t,s){var o=jQuery.isFunction(e[t])&&e[t];i[s[1]](function(){var e=o&&o.apply(this,arguments);e&&jQuery.isFunction(e.promise)?e.promise().done(n.resolve).fail(n.reject).progress(n.notify):n[s[0]+"With"](this===r?n.promise():this,o?[e]:arguments)})}),e=null}).promise()},promise:function(e){return e!=null?jQuery.extend(e,r):r}},i={};return r.pipe=r.then,jQuery.each(t,function(e,s){var o=s[2],u=s[3];r[s[1]]=o.add,u&&o.add(function(){n=u},t[e^1][2].disable,t[2][2].lock),i[s[0]]=function(){return i[s[0]+"With"](this===i?r:this,arguments),this},i[s[0]+"With"]=o.fireWith}),r.promise(i),e&&e.call(i,i),i},when:function(e){var t=0,n=slice.call(arguments),r=n.length,i=r!==1||e&&jQuery.isFunction(e.promise)?r:0,s=i===1?e:jQuery.Deferred(),o=function(e,t,n){return function(r){t[e]=this,n[e]=arguments.length>1?slice.call(arguments):r,n===u?s.notifyWith(t,n):--i||s.resolveWith(t,n)}},u,a,f;if(r>1){u=new Array(r),a=new Array(r),f=new Array(r);for(;t<r;t++)n[t]&&jQuery.isFunction(n[t].promise)?n[t].promise().done(o(t,f,n)).fail(s.reject).progress(o(t,a,u)):--i}return i||s.resolveWith(f,n),s.promise()}});var readyList;jQuery.fn.ready=function(e){return jQuery.ready.promise().done(e),this},jQuery.extend({isReady:!1,readyWait:1,holdReady:function(e){e?jQuery.readyWait++:jQuery.ready(!0)},ready:function(e){if(e===!0?--jQuery.readyWait:jQuery.isReady)return;jQuery.isReady=!0;if(e!==!0&&--jQuery.readyWait>0)return;readyList.resolveWith(document,[jQuery]),jQuery.fn.trigger&&jQuery(document).trigger("ready").off("ready")}}),jQuery.ready.promise=function(e){return readyList||(readyList=jQuery.Deferred(),document.readyState==="complete"?setTimeout(jQuery.ready):(document.addEventListener("DOMContentLoaded",completed,!1),window.addEventListener("load",completed,!1))),readyList.promise(e)},jQuery.ready.promise();var access=jQuery.access=function(e,t,n,r,i,s,o){var u=0,a=e.length,f=n==null;if(jQuery.type(n)==="object"){i=!0;for(u in n)jQuery.access(e,t,u,n[u],!0,s,o)}else if(r!==undefined){i=!0,jQuery.isFunction(r)||(o=!0),f&&(o?(t.call(e,r),t=null):(f=t,t=function(e,t,n){return f.call(jQuery(e),n)}));if(t)for(;u<a;u++)t(e[u],n,o?r:r.call(e[u],u,t(e[u],n)))}return i?e:f?t.call(e):a?t(e[0],n):s};jQuery.acceptData=function(e){return e.nodeType===1||e.nodeType===9||!+e.nodeType},Data.uid=1,Data.accepts=jQuery.acceptData,Data.prototype={key:function(e){if(!Data.accepts(e))return 0;var t={},n=e[this.expando];if(!n){n=Data.uid++;try{t[this.expando]={value:n},Object.defineProperties(e,t)}catch(r){t[this.expando]=n,jQuery.extend(e,t)}}return this.cache[n]||(this.cache[n]={}),n},set:function(e,t,n){var r,i=this.key(e),s=this.cache[i];if(typeof t=="string")s[t]=n;else if(jQuery.isEmptyObject(s))jQuery.extend(this.cache[i],t);else for(r in t)s[r]=t[r];return s},get:function(e,t){var n=this.cache[this.key(e)];return t===undefined?n:n[t]},access:function(e,t,n){var r;return t===undefined||t&&typeof t=="string"&&n===undefined?(r=this.get(e,t),r!==undefined?r:this.get(e,jQuery.camelCase(t))):(this.set(e,t,n),n!==undefined?n:t)},remove:function(e,t){var n,r,i,s=this.key(e),o=this.cache[s];if(t===undefined)this.cache[s]={};else{jQuery.isArray(t)?r=t.concat(t.map(jQuery.camelCase)):(i=jQuery.camelCase(t),t in o?r=[t,i]:(r=i,r=r in o?[r]:r.match(rnotwhite)||[])),n=r.length;while(n--)delete o[r[n]]}},hasData:function(e){return!jQuery.isEmptyObject(this.cache[e[this.expando]]||{})},discard:function(e){e[this.expando]&&delete this.cache[e[this.expando]]}};var data_priv=new Data,data_user=new Data,rbrace=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,rmultiDash=/([A-Z])/g;jQuery.extend({hasData:function(e){return data_user.hasData(e)||data_priv.hasData(e)},data:function(e,t,n){return data_user.access(e,t,n)},removeData:function(e,t){data_user.remove(e,t)},_data:function(e,t,n){return data_priv.access(e,t,n)},_removeData:function(e,t){data_priv.remove(e,t)}}),jQuery.fn.extend({data:function(e,t){var n,r,i,s=this[0],o=s&&s.attributes;if(e===undefined){if(this.length){i=data_user.get(s);if(s.nodeType===1&&!data_priv.get(s,"hasDataAttrs")){n=o.length;while(n--)r=o[n].name,r.indexOf("data-")===0&&(r=jQuery.camelCase(r.slice(5)),dataAttr(s,r,i[r]));data_priv.set(s,"hasDataAttrs",!0)}}return i}return typeof e=="object"?this.each(function(){data_user.set(this,e)}):access(this,function(t){var n,r=jQuery.camelCase(e);if(s&&t===undefined){n=data_user.get(s,e);if(n!==undefined)return n;n=data_user.get(s,r);if(n!==undefined)return n;n=dataAttr(s,r,undefined);if(n!==undefined)return n;return}this.each(function(){var n=data_user.get(this,r);data_user.set(this,r,t),e.indexOf("-")!==-1&&n!==undefined&&data_user.set(this,e,t)})},null,t,arguments.length>1,null,!0)},removeData:function(e){return this.each(function(){data_user.remove(this,e)})}}),jQuery.extend({queue:function(e,t,n){var r;if(e)return t=(t||"fx")+"queue",r=data_priv.get(e,t),n&&(!r||jQuery.isArray(n)?r=data_priv.access(e,t,jQuery.makeArray(n)):r.push(n)),r||[]},dequeue:function(e,t){t=t||"fx";var n=jQuery.queue(e,t),r=n.length,i=n.shift(),s=jQuery._queueHooks(e,t),o=function(){jQuery.dequeue(e,t)};i==="inprogress"&&(i=n.shift(),r--),i&&(t==="fx"&&n.unshift("inprogress"),delete s.stop,i.call(e,o,s)),!r&&s&&s.empty.fire()},_queueHooks:function(e,t){var n=t+"queueHooks";return data_priv.get(e,n)||data_priv.access(e,n,{empty:jQuery.Callbacks("once memory").add(function(){data_priv.remove(e,[t+"queue",n])})})}}),jQuery.fn.extend({queue:function(e,t){var n=2;return typeof e!="string"&&(t=e,e="fx",n--),arguments.length<n?jQuery.queue(this[0],e):t===undefined?this:this.each(function(){var n=jQuery.queue(this,e,t);jQuery._queueHooks(this,e),e==="fx"&&n[0]!=="inprogress"&&jQuery.dequeue(this,e)})},dequeue:function(e){return this.each(function(){jQuery.dequeue(this,e)})},clearQueue:function(e){return this.queue(e||"fx",[])},promise:function(e,t){var n,r=1,i=jQuery.Deferred(),s=this,o=this.length,u=function(){--r||i.resolveWith(s,[s])};typeof e!="string"&&(t=e,e=undefined),e=e||"fx";while(o--)n=data_priv.get(s[o],e+"queueHooks"),n&&n.empty&&(r++,n.empty.add(u));return u(),i.promise(t)}});var pnum=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,cssExpand=["Top","Right","Bottom","Left"],isHidden=function(e,t){return e=t||e,jQuery.css(e,"display")==="none"||!jQuery.contains(e.ownerDocument,e)},rcheckableType=/^(?:checkbox|radio)$/i;(function(){var e=document.createDocumentFragment(),t=e.appendChild(document.createElement("div"));t.innerHTML="<input type='radio' checked='checked' name='t'/>",support.checkClone=t.cloneNode(!0).cloneNode(!0).lastChild.checked,t.innerHTML="<textarea>x</textarea>",support.noCloneChecked=!!t.cloneNode(!0).lastChild.defaultValue})();var strundefined=typeof undefined;support.focusinBubbles="onfocusin"in window;var rkeyEvent=/^key/,rmouseEvent=/^(?:mouse|contextmenu)|click/,rfocusMorph=/^(?:focusinfocus|focusoutblur)$/,rtypenamespace=/^([^.]*)(?:\.(.+)|)$/;jQuery.event={global:{},add:function(e,t,n,r,i){var s,o,u,a,f,l,c,h,p,d,v,m=data_priv.get(e);if(!m)return;n.handler&&(s=n,n=s.handler,i=s.selector),n.guid||(n.guid=jQuery.guid++),(a=m.events)||(a=m.events={}),(o=m.handle)||(o=m.handle=function(t){return typeof jQuery!==strundefined&&jQuery.event.triggered!==t.type?jQuery.event.dispatch.apply(e,arguments):undefined}),t=(t||"").match(rnotwhite)||[""],f=t.length;while(f--){u=rtypenamespace.exec(t[f])||[],p=v=u[1],d=(u[2]||"").split(".").sort();if(!p)continue;c=jQuery.event.special[p]||{},p=(i?c.delegateType:c.bindType)||p,c=jQuery.event.special[p]||{},l=jQuery.extend({type:p,origType:v,data:r,handler:n,guid:n.guid,selector:i,needsContext:i&&jQuery.expr.match.needsContext.test(i),namespace:d.join(".")},s),(h=a[p])||(h=a[p]=[],h.delegateCount=0,(!c.setup||c.setup.call(e,r,d,o)===!1)&&e.addEventListener&&e.addEventListener(p,o,!1)),c.add&&(c.add.call(e,l),l.handler.guid||(l.handler.guid=n.guid)),i?h.splice(h.delegateCount++,0,l):h.push(l),jQuery.event.global[p]=!0}},remove:function(e,t,n,r,i){var s,o,u,a,f,l,c,h,p,d,v,m=data_priv.hasData(e)&&data_priv.get(e);if(!m||!(a=m.events))return;t=(t||"").match(rnotwhite)||[""],f=t.length;while(f--){u=rtypenamespace.exec(t[f])||[],p=v=u[1],d=(u[2]||"").split(".").sort();if(!p){for(p in a)jQuery.event.remove(e,p+t[f],n,r,!0);continue}c=jQuery.event.special[p]||{},p=(r?c.delegateType:c.bindType)||p,h=a[p]||[],u=u[2]&&new RegExp("(^|\\.)"+d.join("\\.(?:.*\\.|)")+"(\\.|$)"),o=s=h.length;while(s--)l=h[s],(i||v===l.origType)&&(!n||n.guid===l.guid)&&(!u||u.test(l.namespace))&&(!r||r===l.selector||r==="**"&&l.selector)&&(h.splice(s,1),l.selector&&h.delegateCount--,c.remove&&c.remove.call(e,l));o&&!h.length&&((!c.teardown||c.teardown.call(e,d,m.handle)===!1)&&jQuery.removeEvent(e,p,m.handle),delete a[p])}jQuery.isEmptyObject(a)&&(delete m.handle,data_priv.remove(e,"events"))},trigger:function(e,t,n,r){var i,s,o,u,a,f,l,c=[n||document],h=hasOwn.call(e,"type")?e.type:e,p=hasOwn.call(e,"namespace")?e.namespace.split("."):[];s=o=n=n||document;if(n.nodeType===3||n.nodeType===8)return;if(rfocusMorph.test(h+jQuery.event.triggered))return;h.indexOf(".")>=0&&(p=h.split("."),h=p.shift(),p.sort()),a=h.indexOf(":")<0&&"on"+h,e=e[jQuery.expando]?e:new jQuery.Event(h,typeof e=="object"&&e),e.isTrigger=r?2:3,e.namespace=p.join("."),e.namespace_re=e.namespace?new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,e.result=undefined,e.target||(e.target=n),t=t==null?[e]:jQuery.makeArray(t,[e]),l=jQuery.event.special[h]||{};if(!r&&l.trigger&&l.trigger.apply(n,t)===!1)return;if(!r&&!l.noBubble&&!jQuery.isWindow(n)){u=l.delegateType||h,rfocusMorph.test(u+h)||(s=s.parentNode);for(;s;s=s.parentNode)c.push(s),o=s;o===(n.ownerDocument||document)&&c.push(o.defaultView||o.parentWindow||window)}i=0;while((s=c[i++])&&!e.isPropagationStopped())e.type=i>1?u:l.bindType||h,f=(data_priv.get(s,"events")||{})[e.type]&&data_priv.get(s,"handle"),f&&f.apply(s,t),f=a&&s[a],f&&f.apply&&jQuery.acceptData(s)&&(e.result=f.apply(s,t),e.result===!1&&e.preventDefault());return e.type=h,!r&&!e.isDefaultPrevented()&&(!l._default||l._default.apply(c.pop(),t)===!1)&&jQuery.acceptData(n)&&a&&jQuery.isFunction(n[h])&&!jQuery.isWindow(n)&&(o=n[a],o&&(n[a]=null),jQuery.event.triggered=h,n[h](),jQuery.event.triggered=undefined,o&&(n[a]=o)),e.result},dispatch:function(e){e=jQuery.event.fix(e);var t,n,r,i,s,o=[],u=slice.call(arguments),a=(data_priv.get(this,"events")||{})[e.type]||[],f=jQuery.event.special[e.type]||{};u[0]=e,e.delegateTarget=this;if(f.preDispatch&&f.preDispatch.call(this,e)===!1)return;o=jQuery.event.handlers.call(this,e,a),t=0;while((i=o[t++])&&!e.isPropagationStopped()){e.currentTarget=i.elem,n=0;while((s=i.handlers[n++])&&!e.isImmediatePropagationStopped())if(!e.namespace_re||e.namespace_re.test(s.namespace))e.handleObj=s,e.data=s.data,r=((jQuery.event.special[s.origType]||{}).handle||s.handler).apply(i.elem,u),r!==undefined&&(e.result=r)===!1&&(e.preventDefault(),e.stopPropagation())}return f.postDispatch&&f.postDispatch.call(this,e),e.result},handlers:function(e,t){var n,r,i,s,o=[],u=t.delegateCount,a=e.target;if(u&&a.nodeType&&(!e.button||e.type!=="click"))for(;a!==this;a=a.parentNode||this)if(a.disabled!==!0||e.type!=="click"){r=[];for(n=0;n<u;n++)s=t[n],i=s.selector+" ",r[i]===undefined&&(r[i]=s.needsContext?jQuery(i,this).index(a)>=0:jQuery.find(i,this,null,[a]).length),r[i]&&r.push(s);r.length&&o.push({elem:a,handlers:r})}return u<t.length&&o.push({elem:this,handlers:t.slice(u)}),o},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(e,t){return e.which==null&&(e.which=t.charCode!=null?t.charCode:t.keyCode),e}},mouseHooks:{props:"button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(e,t){var n,r,i,s=t.button;return e.pageX==null&&t.clientX!=null&&(n=e.target.ownerDocument||document,r=n.documentElement,i=n.body,e.pageX=t.clientX+(r&&r.scrollLeft||i&&i.scrollLeft||0)-(r&&r.clientLeft||i&&i.clientLeft||0),e.pageY=t.clientY+(r&&r.scrollTop||i&&i.scrollTop||0)-(r&&r.clientTop||i&&i.clientTop||0)),!e.which&&s!==undefined&&(e.which=s&1?1:s&2?3:s&4?2:0),e}},fix:function(e){if(e[jQuery.expando])return e;var t,n,r,i=e.type,s=e,o=this.fixHooks[i];o||(this.fixHooks[i]=o=rmouseEvent.test(i)?this.mouseHooks:rkeyEvent.test(i)?this.keyHooks:{}),r=o.props?this.props.concat(o.props):this.props,e=new jQuery.Event(s),t=r.length;while(t--)n=r[t],e[n]=s[n];return e.target||(e.target=document),e.target.nodeType===3&&(e.target=e.target.parentNode),o.filter?o.filter(e,s):e},special:{load:{noBubble:!0},focus:{trigger:function(){if(this!==safeActiveElement()&&this.focus)return this.focus(),!1},delegateType:"focusin"},blur:{trigger:function(){if(this===safeActiveElement()&&this.blur)return this.blur(),!1},delegateType:"focusout"},click:{trigger:function(){if(this.type==="checkbox"&&this.click&&jQuery.nodeName(this,"input"))return this.click(),!1},_default:function(e){return jQuery.nodeName(e.target,"a")}},beforeunload:{postDispatch:function(e){e.result!==undefined&&(e.originalEvent.returnValue=e.result)}}},simulate:function(e,t,n,r){var i=jQuery.extend(new jQuery.Event,n,{type:e,isSimulated:!0,originalEvent:{}});r?jQuery.event.trigger(i,null,t):jQuery.event.dispatch.call(t,i),i.isDefaultPrevented()&&n.preventDefault()}},jQuery.removeEvent=function(e,t,n){e.removeEventListener&&e.removeEventListener(t,n,!1)},jQuery.Event=function(e,t){if(!(this instanceof jQuery.Event))return new jQuery.Event(e,t);e&&e.type?(this.originalEvent=e,this.type=e.type,this.isDefaultPrevented=e.defaultPrevented||e.defaultPrevented===undefined&&e.getPreventDefault&&e.getPreventDefault()?returnTrue:returnFalse):this.type=e,t&&jQuery.extend(this,t),this.timeStamp=e&&e.timeStamp||jQuery.now(),this[jQuery.expando]=!0},jQuery.Event.prototype={isDefaultPrevented:returnFalse,isPropagationStopped:returnFalse,isImmediatePropagationStopped:returnFalse,preventDefault:function(){var e=this.originalEvent;this.isDefaultPrevented=returnTrue,e&&e.preventDefault&&e.preventDefault()},stopPropagation:function(){var e=this.originalEvent;this.isPropagationStopped=returnTrue,e&&e.stopPropagation&&e.stopPropagation()},stopImmediatePropagation:function(){this.isImmediatePropagationStopped=returnTrue,this.stopPropagation()}},jQuery.each({mouseenter:"mouseover",mouseleave:"mouseout"},function(e,t){jQuery.event.special[e]={delegateType:t,bindType:t,handle:function(e){var n,r=this,i=e.relatedTarget,s=e.handleObj;if(!i||i!==r&&!jQuery.contains(r,i))e.type=s.origType,n=s.handler.apply(this,arguments),e.type=t;return n}}}),support.focusinBubbles||jQuery.each({focus:"focusin",blur:"focusout"},function(e,t){var n=function(e){jQuery.event.simulate(t,e.target,jQuery.event.fix(e),!0)};jQuery.event.special[t]={setup:function(){var r=this.ownerDocument||this,i=data_priv.access(r,t);i||r.addEventListener(e,n,!0),data_priv.access(r,t,(i||0)+1)},teardown:function(){var r=this.ownerDocument||this,i=data_priv.access(r,t)-1;i?data_priv.access(r,t,i):(r.removeEventListener(e,n,!0),data_priv.remove(r,t))}}}),jQuery.fn.extend({on:function(e,t,n,r,i){var s,o;if(typeof e=="object"){typeof t!="string"&&(n=n||t,t=undefined);for(o in e)this.on(o,t,n,e[o],i);return this}n==null&&r==null?(r=t,n=t=undefined):r==null&&(typeof t=="string"?(r=n,n=undefined):(r=n,n=t,t=undefined));if(r===!1)r=returnFalse;else if(!r)return this;return i===1&&(s=r,r=function(e){return jQuery().off(e),s.apply(this,arguments)},r.guid=s.guid||(s.guid=jQuery.guid++)),this.each(function(){jQuery.event.add(this,e,r,n,t)})},one:function(e,t,n,r){return this.on(e,t,n,r,1)},off:function(e,t,n){var r,i;if(e&&e.preventDefault&&e.handleObj)return r=e.handleObj,jQuery(e.delegateTarget).off(r.namespace?r.origType+"."+r.namespace:r.origType,r.selector,r.handler),this;if(typeof e=="object"){for(i in e)this.off(i,t,e[i]);return this}if(t===!1||typeof t=="function")n=t,t=undefined;return n===!1&&(n=returnFalse),this.each(function(){jQuery.event.remove(this,e,n,t)})},trigger:function(e,t){return this.each(function(){jQuery.event.trigger(e,t,this)})},triggerHandler:function(e,t){var n=this[0];if(n)return jQuery.event.trigger(e,t,n,!0)}});var rxhtmlTag=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,rtagName=/<([\w:]+)/,rhtml=/<|&#?\w+;/,rnoInnerhtml=/<(?:script|style|link)/i,rchecked=/checked\s*(?:[^=]|=\s*.checked.)/i,rscriptType=/^$|\/(?:java|ecma)script/i,rscriptTypeMasked=/^true\/(.*)/,rcleanScript=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,wrapMap={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};wrapMap.optgroup=wrapMap.option,wrapMap.tbody=wrapMap.tfoot=wrapMap.colgroup=wrapMap.caption=wrapMap.thead,wrapMap.th=wrapMap.td,jQuery.extend({clone:function(e,t,n){var r,i,s,o,u=e.cloneNode(!0),a=jQuery.contains(e.ownerDocument,e);if(!support.noCloneChecked&&(e.nodeType===1||e.nodeType===11)&&!jQuery.isXMLDoc(e)){o=getAll(u),s=getAll(e);for(r=0,i=s.length;r<i;r++)fixInput(s[r],o[r])}if(t)if(n){s=s||getAll(e),o=o||getAll(u);for(r=0,i=s.length;r<i;r++)cloneCopyEvent(s[r],o[r])}else cloneCopyEvent(e,u);return o=getAll(u,"script"),o.length>0&&setGlobalEval(o,!a&&getAll(e,"script")),u},buildFragment:function(e,t,n,r){var i,s,o,u,a,f,l=t.createDocumentFragment(),c=[],h=0,p=e.length;for(;h<p;h++){i=e[h];if(i||i===0)if(jQuery.type(i)==="object")jQuery.merge(c,i.nodeType?[i]:i);else if(!rhtml.test(i))c.push(t.createTextNode(i));else{s=s||l.appendChild(t.createElement("div")),o=(rtagName.exec(i)||["",""])[1].toLowerCase(),u=wrapMap[o]||wrapMap._default,s.innerHTML=u[1]+i.replace(rxhtmlTag,"<$1></$2>")+u[2],f=u[0];while(f--)s=s.lastChild;jQuery.merge(c,s.childNodes),s=l.firstChild,s.textContent=""}}l.textContent="",h=0;while(i=c[h++]){if(r&&jQuery.inArray(i,r)!==-1)continue;a=jQuery.contains(i.ownerDocument,i),s=getAll(l.appendChild(i),"script"),a&&setGlobalEval(s);if(n){f=0;while(i=s[f++])rscriptType.test(i.type||"")&&n.push(i)}}return l},cleanData:function(e){var t,n,r,i,s,o,u=jQuery.event.special,a=0;for(;(n=e[a])!==undefined;a++){if(jQuery.acceptData(n)){s=n[data_priv.expando];if(s&&(t=data_priv.cache[s])){r=Object.keys(t.events||{});if(r.length)for(o=0;(i=r[o])!==undefined;o++)u[i]?jQuery.event.remove(n,i):jQuery.removeEvent(n,i,t.handle);data_priv.cache[s]&&delete data_priv.cache[s]}}delete data_user.cache[n[data_user.expando]]}}}),jQuery.fn.extend({text:function(e){return access(this,function(e){return e===undefined?jQuery.text(this):this.empty().each(function(){if(this.nodeType===1||this.nodeType===11||this.nodeType===9)this.textContent=e})},null,e,arguments.length)},append:function(){return this.domManip(arguments,function(e){if(this.nodeType===1||this.nodeType===11||this.nodeType===9){var t=manipulationTarget(this,e);t.appendChild(e)}})},prepend:function(){return this.domManip(arguments,function(e){if(this.nodeType===1||this.nodeType===11||this.nodeType===9){var t=manipulationTarget(this,e);t.insertBefore(e,t.firstChild)}})},before:function(){return this.domManip(arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this)})},after:function(){return this.domManip(arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this.nextSibling)})},remove:function(e,t){var n,r=e?jQuery.filter(e,this):this,i=0;for(;(n=r[i])!=null;i++)!t&&n.nodeType===1&&jQuery.cleanData(getAll(n)),n.parentNode&&(t&&jQuery.contains(n.ownerDocument,n)&&setGlobalEval(getAll(n,"script")),n.parentNode.removeChild(n));return this},empty:function(){var e,t=0;for(;(e=this[t])!=null;t++)e.nodeType===1&&(jQuery.cleanData(getAll(e,!1)),e.textContent="");return this},clone:function(e,t){return e=e==null?!1:e,t=t==null?e:t,this.map(function(){return jQuery.clone(this,e,t)})},html:function(e){return access(this,function(e){var t=this[0]||{},n=0,r=this.length;if(e===undefined&&t.nodeType===1)return t.innerHTML;if(typeof e=="string"&&!rnoInnerhtml.test(e)&&!wrapMap[(rtagName.exec(e)||["",""])[1].toLowerCase()]){e=e.replace(rxhtmlTag,"<$1></$2>");try{for(;n<r;n++)t=this[n]||{},t.nodeType===1&&(jQuery.cleanData(getAll(t,!1)),t.innerHTML=e);t=0}catch(i){}}t&&this.empty().append(e)},null,e,arguments.length)},replaceWith:function(){var e=arguments[0];return this.domManip(arguments,function(t){e=this.parentNode,jQuery.cleanData(getAll(this)),e&&e.replaceChild(t,this)}),e&&(e.length||e.nodeType)?this:this.remove()},detach:function(e){return this.remove(e,!0)},domManip:function(e,t){e=concat.apply([],e);var n,r,i,s,o,u,a=0,f=this.length,l=this,c=f-1,h=e[0],p=jQuery.isFunction(h);if(p||f>1&&typeof h=="string"&&!support.checkClone&&rchecked.test(h))return this.each(function(n){var r=l.eq(n);p&&(e[0]=h.call(this,n,r.html())),r.domManip(e,t)});if(f){n=jQuery.buildFragment(e,this[0].ownerDocument,!1,this),r=n.firstChild,n.childNodes.length===1&&(n=r);if(r){i=jQuery.map(getAll(n,"script"),disableScript),s=i.length;for(;a<f;a++)o=n,a!==c&&(o=jQuery.clone(o,!0,!0),s&&jQuery.merge(i,getAll(o,"script"))),t.call(this[a],o,a);if(s){u=i[i.length-1].ownerDocument,jQuery.map(i,restoreScript);for(a=0;a<s;a++)o=i[a],rscriptType.test(o.type||"")&&!data_priv.access(o,"globalEval")&&jQuery.contains(u,o)&&(o.src?jQuery._evalUrl&&jQuery._evalUrl(o.src):jQuery.globalEval(o.textContent.replace(rcleanScript,"")))}}}return this}}),jQuery.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(e,t){jQuery.fn[e]=function(e){var n,r=[],i=jQuery(e),s=i.length-1,o=0;for(;o<=s;o++)n=o===s?this:this.clone(!0),jQuery(i[o])[t](n),push.apply(r,n.get());return this.pushStack(r)}});var iframe,elemdisplay={},rmargin=/^margin/,rnumnonpx=new RegExp("^("+pnum+")(?!px)[a-z%]+$","i"),getStyles=function(e){return e.ownerDocument.defaultView.getComputedStyle(e,null)};(function(){function o(){s.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%",r.appendChild(i);var n=window.getComputedStyle(s,null);e=n.top!=="1%",t=n.width==="4px",r.removeChild(i)}var e,t,n="padding:0;margin:0;border:0;display:block;-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box",r=document.documentElement,i=document.createElement("div"),s=document.createElement("div");s.style.backgroundClip="content-box",s.cloneNode(!0).style.backgroundClip="",support.clearCloneStyle=s.style.backgroundClip==="content-box",i.style.cssText="border:0;width:0;height:0;position:absolute;top:0;left:-9999px;margin-top:1px",i.appendChild(s),window.getComputedStyle&&jQuery.extend(support,{pixelPosition:function(){return o(),e},boxSizingReliable:function(){return t==null&&o(),t},reliableMarginRight:function(){var e,t=s.appendChild(document.createElement("div"));return t.style.cssText=s.style.cssText=n,t.style.marginRight=t.style.width="0",s.style.width="1px",r.appendChild(i),e=!parseFloat(window.getComputedStyle(t,null).marginRight),r.removeChild(i),s.innerHTML="",e}})})(),jQuery.swap=function(e,t,n,r){var i,s,o={};for(s in t)o[s]=e.style[s],e.style[s]=t[s];i=n.apply(e,r||[]);for(s in t)e.style[s]=o[s];return i};var rdisplayswap=/^(none|table(?!-c[ea]).+)/,rnumsplit=new RegExp("^("+pnum+")(.*)$","i"),rrelNum=new RegExp("^([+-])=("+pnum+")","i"),cssShow={position:"absolute",visibility:"hidden",display:"block"},cssNormalTransform={letterSpacing:0,fontWeight:400},cssPrefixes=["Webkit","O","Moz","ms"];jQuery.extend({cssHooks:{opacity:{get:function(e,t){if(t){var n=curCSS(e,"opacity");return n===""?"1":n}}}},cssNumber:{columnCount:!0,fillOpacity:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":"cssFloat"},style:function(e,t,n,r){if(!e||e.nodeType===3||e.nodeType===8||!e.style)return;var i,s,o,u=jQuery.camelCase(t),a=e.style;t=jQuery.cssProps[u]||(jQuery.cssProps[u]=vendorPropName(a,u)),o=jQuery.cssHooks[t]||jQuery.cssHooks[u];if(n===undefined)return o&&"get"in o&&(i=o.get(e,!1,r))!==undefined?i:a[t];s=typeof n,s==="string"&&(i=rrelNum.exec(n))&&(n=(i[1]+1)*i[2]+parseFloat(jQuery.css(e,t)),s="number");if(n==null||n!==n)return;s==="number"&&!jQuery.cssNumber[u]&&(n+="px"),!support.clearCloneStyle&&n===""&&t.indexOf("background")===0&&(a[t]="inherit");if(!o||!("set"in o)||(n=o.set(e,n,r))!==undefined)a[t]="",a[t]=n},css:function(e,t,n,r){var i,s,o,u=jQuery.camelCase(t);return t=jQuery.cssProps[u]||(jQuery.cssProps[u]=vendorPropName(e.style,u)),o=jQuery.cssHooks[t]||jQuery.cssHooks[u],o&&"get"in o&&(i=o.get(e,!0,n)),i===undefined&&(i=curCSS(e,t,r)),i==="normal"&&t in cssNormalTransform&&(i=cssNormalTransform[t]),n===""||n?(s=parseFloat(i),n===!0||jQuery.isNumeric(s)?s||0:i):i}}),jQuery.each(["height","width"],function(e,t){jQuery.cssHooks[t]={get:function(e,n,r){if(n)return e.offsetWidth===0&&rdisplayswap.test(jQuery.css(e,"display"))?jQuery.swap(e,cssShow,function(){return getWidthOrHeight(e,t,r)}):getWidthOrHeight(e,t,r)},set:function(e,n,r){var i=r&&getStyles(e);return setPositiveNumber(e,n,r?augmentWidthOrHeight(e,t,r,jQuery.css(e,"boxSizing",!1,i)==="border-box",i):0)}}}),jQuery.cssHooks.marginRight=addGetHookIf(support.reliableMarginRight,function(e,t){if(t)return jQuery.swap(e,{display:"inline-block"},curCSS,[e,"marginRight"])}),jQuery.each({margin:"",padding:"",border:"Width"},function(e,t){jQuery.cssHooks[e+t]={expand:function(n){var r=0,i={},s=typeof n=="string"?n.split(" "):[n];for(;r<4;r++)i[e+cssExpand[r]+t]=s[r]||s[r-2]||s[0];return i}},rmargin.test(e)||(jQuery.cssHooks[e+t].set=setPositiveNumber)}),jQuery.fn.extend({css:function(e,t){return access(this,function(e,t,n){var r,i,s={},o=0;if(jQuery.isArray(t)){r=getStyles(e),i=t.length;for(;o<i;o++)s[t[o]]=jQuery.css(e,t[o],!1,r);return s}return n!==undefined?jQuery.style(e,t,n):jQuery.css(e,t)},e,t,arguments.length>1)},show:function(){return showHide(this,!0)},hide:function(){return showHide(this)},toggle:function(e){return typeof e=="boolean"?e?this.show():this.hide():this.each(function(){isHidden(this)?jQuery(this).show():jQuery(this).hide()})}}),jQuery.Tween=Tween,Tween.prototype={constructor:Tween,init:function(e,t,n,r,i,s){this.elem=e,this.prop=n,this.easing=i||"swing",this.options=t,this.start=this.now=this.cur(),this.end=r,this.unit=s||(jQuery.cssNumber[n]?"":"px")},cur:function(){var e=Tween.propHooks[this.prop];return e&&e.get?e.get(this):Tween.propHooks._default.get(this)},run:function(e){var t,n=Tween.propHooks[this.prop];return this.options.duration?this.pos=t=jQuery.easing[this.easing](e,this.options.duration*e,0,1,this.options.duration):this.pos=t=e,this.now=(this.end-this.start)*t+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),n&&n.set?n.set(this):Tween.propHooks._default.set(this),this}},Tween.prototype.init.prototype=Tween.prototype,Tween.propHooks={_default:{get:function(e){var t;return e.elem[e.prop]==null||!!e.elem.style&&e.elem.style[e.prop]!=null?(t=jQuery.css(e.elem,e.prop,""),!t||t==="auto"?0:t):e.elem[e.prop]},set:function(e){jQuery.fx.step[e.prop]?jQuery.fx.step[e.prop](e):e.elem.style&&(e.elem.style[jQuery.cssProps[e.prop]]!=null||jQuery.cssHooks[e.prop])?jQuery.style(e.elem,e.prop,e.now+e.unit):e.elem[e.prop]=e.now}}},Tween.propHooks.scrollTop=Tween.propHooks.scrollLeft={set:function(e){e.elem.nodeType&&e.elem.parentNode&&(e.elem[e.prop]=e.now)}},jQuery.easing={linear:function(e){return e},swing:function(e){return.5-Math.cos(e*Math.PI)/2}},jQuery.fx=Tween.prototype.init,jQuery.fx.step={};var fxNow,timerId,rfxtypes=/^(?:toggle|show|hide)$/,rfxnum=new RegExp("^(?:([+-])=|)("+pnum+")([a-z%]*)$","i"),rrun=/queueHooks$/,animationPrefilters=[defaultPrefilter],tweeners={"*":[function(e,t){var n=this.createTween(e,t),r=n.cur(),i=rfxnum.exec(t),s=i&&i[3]||(jQuery.cssNumber[e]?"":"px"),o=(jQuery.cssNumber[e]||s!=="px"&&+r)&&rfxnum.exec(jQuery.css(n.elem,e)),u=1,a=20;if(o&&o[3]!==s){s=s||o[3],i=i||[],o=+r||1;do u=u||".5",o/=u,jQuery.style(n.elem,e,o+s);while(u!==(u=n.cur()/r)&&u!==1&&--a)}return i&&(o=n.start=+o||+r||0,n.unit=s,n.end=i[1]?o+(i[1]+1)*i[2]:+i[2]),n}]};jQuery.Animation=jQuery.extend(Animation,{tweener:function(e,t){jQuery.isFunction(e)?(t=e,e=["*"]):e=e.split(" ");var n,r=0,i=e.length;for(;r<i;r++)n=e[r],tweeners[n]=tweeners[n]||[],tweeners[n].unshift(t)},prefilter:function(e,t){t?animationPrefilters.unshift(e):animationPrefilters.push(e)}}),jQuery.speed=function(e,t,n){var r=e&&typeof e=="object"?jQuery.extend({},e):{complete:n||!n&&t||jQuery.isFunction(e)&&e,duration:e,easing:n&&t||t&&!jQuery.isFunction(t)&&t};r.duration=jQuery.fx.off?0:typeof r.duration=="number"?r.duration:r.duration in jQuery.fx.speeds?jQuery.fx.speeds[r.duration]:jQuery.fx.speeds._default;if(r.queue==null||r.queue===!0)r.queue="fx";return r.old=r.complete,r.complete=function(){jQuery.isFunction(r.old)&&r.old.call(this),r.queue&&jQuery.dequeue(this,r.queue)},r},jQuery.fn.extend({fadeTo:function(e,t,n,r){return this.filter(isHidden).css("opacity",0).show().end().animate({opacity:t},e,n,r)},animate:function(e,t,n,r){var i=jQuery.isEmptyObject(e),s=jQuery.speed(t,n,r),o=function(){var t=Animation(this,jQuery.extend({},e),s);(i||data_priv.get(this,"finish"))&&t.stop(!0)};return o.finish=o,i||s.queue===!1?this.each(o):this.queue(s.queue,o)},stop:function(e,t,n){var r=function(e){var t=e.stop;delete e.stop,t(n)};return typeof e!="string"&&(n=t,t=e,e=undefined),t&&e!==!1&&this.queue(e||"fx",[]),this.each(function(){var t=!0,i=e!=null&&e+"queueHooks",s=jQuery.timers,o=data_priv.get(this);if(i)o[i]&&o[i].stop&&r(o[i]);else for(i in o)o[i]&&o[i].stop&&rrun.test(i)&&r(o[i]);for(i=s.length;i--;)s[i].elem===this&&(e==null||s[i].queue===e)&&(s[i].anim.stop(n),t=!1,s.splice(i,1));(t||!n)&&jQuery.dequeue(this,e)})},finish:function(e){return e!==!1&&(e=e||"fx"),this.each(function(){var t,n=data_priv.get(this),r=n[e+"queue"],i=n[e+"queueHooks"],s=jQuery.timers,o=r?r.length:0;n.finish=!0,jQuery.queue(this,e,[]),i&&i.stop&&i.stop.call(this,!0);for(t=s.length;t--;)s[t].elem===this&&s[t].queue===e&&(s[t].anim.stop(!0),s.splice(t,1));for(t=0;t<o;t++)r[t]&&r[t].finish&&r[t].finish.call(this);delete n.finish})}}),jQuery.each(["toggle","show","hide"],function(e,t){var n=jQuery.fn[t];jQuery.fn[t]=function(e,r,i){return e==null||typeof e=="boolean"?n.apply(this,arguments):this.animate(genFx(t,!0),e,r,i)}}),jQuery.each({slideDown:genFx("show"),slideUp:genFx("hide"),slideToggle:genFx("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(e,t){jQuery.fn[e]=function(e,n,r){return this.animate(t,e,n,r)}}),jQuery.timers=[],jQuery.fx.tick=function(){var e,t=0,n=jQuery.timers;fxNow=jQuery.now();for(;t<n.length;t++)e=n[t],!e()&&n[t]===e&&n.splice(t--,1);n.length||jQuery.fx.stop(),fxNow=undefined},jQuery.fx.timer=function(e){jQuery.timers.push(e),e()?jQuery.fx.start():jQuery.timers.pop()},jQuery.fx.interval=13,jQuery.fx.start=function(){timerId||(timerId=setInterval(jQuery.fx.tick,jQuery.fx.interval))},jQuery.fx.stop=function(){clearInterval(timerId),timerId=null},jQuery.fx.speeds={slow:600,fast:200,_default:400},jQuery.fn.delay=function(e,t){return e=jQuery.fx?jQuery.fx.speeds[e]||e:e,t=t||"fx",this.queue(t,function(t,n){var r=setTimeout(t,e);n.stop=function(){clearTimeout(r)}})},function(){var e=document.createElement("input"),t=document.createElement("select"),n=t.appendChild(document.createElement("option"));e.type="checkbox",support.checkOn=e.value!=="",support.optSelected=n.selected,t.disabled=!0,support.optDisabled=!n.disabled,e=document.createElement("input"),e.value="t",e.type="radio",support.radioValue=e.value==="t"}();var nodeHook,boolHook,attrHandle=jQuery.expr.attrHandle;jQuery.fn.extend({attr:function(e,t){return access(this,jQuery.attr,e,t,arguments.length>1)},removeAttr:function(e){return this.each(function(){jQuery.removeAttr(this,e)})}}),jQuery.extend({attr:function(e,t,n){var r,i,s=e.nodeType;if(!e||s===3||s===8||s===2)return;if(typeof e.getAttribute===strundefined)return jQuery.prop(e,t,n);if(s!==1||!jQuery.isXMLDoc(e))t=t.toLowerCase(),r=jQuery.attrHooks[t]||(jQuery.expr.match.bool.test(t)?boolHook:nodeHook);if(n===undefined)return r&&"get"in r&&(i=r.get(e,t))!==null?i:(i=jQuery.find.attr(e,t),i==null?undefined:i);if(n!==null)return r&&"set"in r&&(i=r.set(e,n,t))!==undefined?i:(e.setAttribute(t,n+""),n);jQuery.removeAttr(e,t)},removeAttr:function(e,t){var n,r,i=0,s=t&&t.match(rnotwhite);if(s&&e.nodeType===1)while(n=s[i++])r=jQuery.propFix[n]||n,jQuery.expr.match.bool.test(n)&&(e[r]=!1),e.removeAttribute(n)},attrHooks:{type:{set:function(e,t){if(!support.radioValue&&t==="radio"&&jQuery.nodeName(e,"input")){var n=e.value;return e.setAttribute("type",t),n&&(e.value=n),t}}}}}),boolHook={set:function(e,t,n){return t===!1?jQuery.removeAttr(e,n):e.setAttribute(n,n),n}},jQuery.each(jQuery.expr.match.bool.source.match(/\w+/g),function(e,t){var n=attrHandle[t]||jQuery.find.attr;attrHandle[t]=function(e,t,r){var i,s;return r||(s=attrHandle[t],attrHandle[t]=i,i=n(e,t,r)!=null?t.toLowerCase():null,attrHandle[t]=s),i}});var rfocusable=/^(?:input|select|textarea|button)$/i;jQuery.fn.extend({prop:function(e,t){return access(this,jQuery.prop,e,t,arguments.length>1)},removeProp:function(e){return this.each(function(){delete this[jQuery.propFix[e]||e]})}}),jQuery.extend({propFix:{"for":"htmlFor","class":"className"},prop:function(e,t,n){var r,i,s,o=e.nodeType;if(!e||o===3||o===8||o===2)return;return s=o!==1||!jQuery.isXMLDoc(e),s&&(t=jQuery.propFix[t]||t,i=jQuery.propHooks[t]),n!==undefined?i&&"set"in i&&(r=i.set(e,n,t))!==undefined?r:e[t]=n:i&&"get"in i&&(r=i.get(e,t))!==null?r:e[t]},propHooks:{tabIndex:{get:function(e){return e.hasAttribute("tabindex")||rfocusable.test(e.nodeName)||e.href?e.tabIndex:-1}}}}),support.optSelected||(jQuery.propHooks.selected={get:function(e){var t=e.parentNode;return t&&t.parentNode&&t.parentNode.selectedIndex,null}}),jQuery.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){jQuery.propFix[this.toLowerCase()]=this});var rclass=/[\t\r\n\f]/g;jQuery.fn.extend({addClass:function(e){var t,n,r,i,s,o,u=typeof e=="string"&&e,a=0,f=this.length;if(jQuery.isFunction(e))return this.each(function(t){jQuery(this).addClass(e.call(this,t,this.className))});if(u){t=(e||"").match(rnotwhite)||[];for(;a<f;a++){n=this[a],r=n.nodeType===1&&(n.className?(" "+n.className+" ").replace(rclass," "):" ");if(r){s=0;while(i=t[s++])r.indexOf(" "+i+" ")<0&&(r+=i+" ");o=jQuery.trim(r),n.className!==o&&(n.className=o)}}}return this},removeClass:function(e){var t,n,r,i,s,o,u=arguments.length===0||typeof e=="string"&&e,a=0,f=this.length;if(jQuery.isFunction(e))return this.each(function(t){jQuery(this).removeClass(e.call(this,t,this.className))});if(u){t=(e||"").match(rnotwhite)||[];for(;a<f;a++){n=this[a],r=n.nodeType===1&&(n.className?(" "+n.className+" ").replace(rclass," "):"");if(r){s=0;while(i=t[s++])while(r.indexOf(" "+i+" ")>=0)r=r.replace(" "+i+" "," ");o=e?jQuery.trim(r):"",n.className!==o&&(n.className=o)}}}return this},toggleClass:function(e,t){var n=typeof e;return typeof t=="boolean"&&n==="string"?t?this.addClass(e):this.removeClass(e):jQuery.isFunction(e)?this.each(function(n){jQuery(this).toggleClass(e.call(this,n,this.className,t),t)}):this.each(function(){if(n==="string"){var t,r=0,i=jQuery(this),s=e.match(rnotwhite)||[];while(t=s[r++])i.hasClass(t)?i.removeClass(t):i.addClass(t)}else if(n===strundefined||n==="boolean")this.className&&data_priv.set(this,"__className__",this.className),this.className=this.className||e===!1?"":data_priv.get(this,"__className__")||""})},hasClass:function(e){var t=" "+e+" ",n=0,r=this.length;for(;n<r;n++)if(this[n].nodeType===1&&(" "+this[n].className+" ").replace(rclass," ").indexOf(t)>=0)return!0;return!1}});var rreturn=/\r/g;jQuery.fn.extend({val:function(e){var t,n,r,i=this[0];if(!arguments.length){if(i)return t=jQuery.valHooks[i.type]||jQuery.valHooks[i.nodeName.toLowerCase()],t&&"get"in t&&(n=t.get(i,"value"))!==undefined?n:(n=i.value,typeof n=="string"?n.replace(rreturn,""):n==null?"":n);return}return r=jQuery.isFunction(e),this.each(function(n){var i;if(this.nodeType!==1)return;r?i=e.call(this,n,jQuery(this).val()):i=e,i==null?i="":typeof i=="number"?i+="":jQuery.isArray(i)&&(i=jQuery.map(i,function(e){return e==null?"":e+""})),t=jQuery.valHooks[this.type]||jQuery.valHooks[this.nodeName.toLowerCase()];if(!t||!("set"in t)||t.set(this,i,"value")===undefined)this.value=i})}}),jQuery.extend({valHooks:{select:{get:function(e){var t,n,r=e.options,i=e.selectedIndex,s=e.type==="select-one"||i<0,o=s?null:[],u=s?i+1:r.length,a=i<0?u:s?i:0;for(;a<u;a++){n=r[a];if((n.selected||a===i)&&(support.optDisabled?!n.disabled:n.getAttribute("disabled")===null)&&(!n.parentNode.disabled||!jQuery.nodeName(n.parentNode,"optgroup"))){t=jQuery(n).val();if(s)return t;o.push(t)}}return o},set:function(e,t){var n,r,i=e.options,s=jQuery.makeArray(t),o=i.length;while(o--){r=i[o];if(r.selected=jQuery.inArray(jQuery(r).val(),s)>=0)n=!0}return n||(e.selectedIndex=-1),s}}}}),jQuery.each(["radio","checkbox"],function(){jQuery.valHooks[this]={set:function(e,t){if(jQuery.isArray(t))return e.checked=jQuery.inArray(jQuery(e).val(),t)>=0}},support.checkOn||(jQuery.valHooks[this].get=function(e){return e.getAttribute("value")===null?"on":e.value})}),jQuery.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(e,t){jQuery.fn[t]=function(e,n){return arguments.length>0?this.on(t,null,e,n):this.trigger(t)}}),jQuery.fn.extend({hover:function(e,t){return this.mouseenter(e).mouseleave(t||e)},bind:function(e,t,n){return this.on(e,null,t,n)},unbind:function(e,t){return this.off(e,null,t)},delegate:function(e,t,n,r){return this.on(t,e,n,r)},undelegate:function(e,t,n){return arguments.length===1?this.off(e,"**"):this.off(t,e||"**",n)}});var nonce=jQuery.now(),rquery=/\?/;jQuery.parseJSON=function(e){return JSON.parse(e+"")},jQuery.parseXML=function(e){var t,n;if(!e||typeof e!="string")return null;try{n=new DOMParser,t=n.parseFromString(e,"text/xml")}catch(r){t=undefined}return(!t||t.getElementsByTagName("parsererror").length)&&jQuery.error("Invalid XML: "+e),t};var ajaxLocParts,ajaxLocation,rhash=/#.*$/,rts=/([?&])_=[^&]*/,rheaders=/^(.*?):[ \t]*([^\r\n]*)$/mg,rlocalProtocol=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,rnoContent=/^(?:GET|HEAD)$/,rprotocol=/^\/\//,rurl=/^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,prefilters={},transports={},allTypes="*/".concat("*");try{ajaxLocation=location.href}catch(e){ajaxLocation=document.createElement("a"),ajaxLocation.href="",ajaxLocation=ajaxLocation.href}ajaxLocParts=rurl.exec(ajaxLocation.toLowerCase())||[],jQuery.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:ajaxLocation,type:"GET",isLocal:rlocalProtocol.test(ajaxLocParts[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":allTypes,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":jQuery.parseJSON,"text xml":jQuery.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(e,t){return t?ajaxExtend(ajaxExtend(e,jQuery.ajaxSettings),t):ajaxExtend(jQuery.ajaxSettings,e)},ajaxPrefilter:addToPrefiltersOrTransports(prefilters),ajaxTransport:addToPrefiltersOrTransports(transports),ajax:function(e,t){function S(e,t,s,u){var f,m,g,b,E,S=t;if(y===2)return;y=2,o&&clearTimeout(o),n=undefined,i=u||"",w.readyState=e>0?4:0,f=e>=200&&e<300||e===304,s&&(b=ajaxHandleResponses(l,w,s)),b=ajaxConvert(l,b,w,f);if(f)l.ifModified&&(E=w.getResponseHeader("Last-Modified"),E&&(jQuery.lastModified[r]=E),E=w.getResponseHeader("etag"),E&&(jQuery.etag[r]=E)),e===204||l.type==="HEAD"?S="nocontent":e===304?S="notmodified":(S=b.state,m=b.data,g=b.error,f=!g);else{g=S;if(e||!S)S="error",e<0&&(e=0)}w.status=e,w.statusText=(t||S)+"",f?p.resolveWith(c,[m,S,w]):p.rejectWith(c,[w,S,g]),w.statusCode(v),v=undefined,a&&h.trigger(f?"ajaxSuccess":"ajaxError",[w,l,f?m:g]),d.fireWith(c,[w,S]),a&&(h.trigger("ajaxComplete",[w,l]),--jQuery.active||jQuery.event.trigger("ajaxStop"))}typeof e=="object"&&(t=e,e=undefined),t=t||{};var n,r,i,s,o,u,a,f,l=jQuery.ajaxSetup({},t),c=l.context||l,h=l.context&&(c.nodeType||c.jquery)?jQuery(c):jQuery.event,p=jQuery.Deferred(),d=jQuery.Callbacks("once memory"),v=l.statusCode||{},m={},g={},y=0,b="canceled",w={readyState:0,getResponseHeader:function(e){var t;if(y===2){if(!s){s={};while(t=rheaders.exec(i))s[t[1].toLowerCase()]=t[2]}t=s[e.toLowerCase()]}return t==null?null:t},getAllResponseHeaders:function(){return y===2?i:null},setRequestHeader:function(e,t){var n=e.toLowerCase();return y||(e=g[n]=g[n]||e,m[e]=t),this},overrideMimeType:function(e){return y||(l.mimeType=e),this},statusCode:function(e){var t;if(e)if(y<2)for(t in e)v[t]=[v[t],e[t]];else w.always(e[w.status]);return this},abort:function(e){var t=e||b;return n&&n.abort(t),S(0,t),this}};p.promise(w).complete=d.add,w.success=w.done,w.error=w.fail,l.url=((e||l.url||ajaxLocation)+"").replace(rhash,"").replace(rprotocol,ajaxLocParts[1]+"//"),l.type=t.method||t.type||l.method||l.type,l.dataTypes=jQuery.trim(l.dataType||"*").toLowerCase().match(rnotwhite)||[""],l.crossDomain==null&&(u=rurl.exec(l.url.toLowerCase()),l.crossDomain=!(!u||u[1]===ajaxLocParts[1]&&u[2]===ajaxLocParts[2]&&(u[3]||(u[1]==="http:"?"80":"443"))===(ajaxLocParts[3]||(ajaxLocParts[1]==="http:"?"80":"443")))),l.data&&l.processData&&typeof l.data!="string"&&(l.data=jQuery.param(l.data,l.traditional)),inspectPrefiltersOrTransports(prefilters,l,t,w);if(y===2)return w;a=l.global,a&&jQuery.active++===0&&jQuery.event.trigger("ajaxStart"),l.type=l.type.toUpperCase(),l.hasContent=!rnoContent.test(l.type),r=l.url,l.hasContent||(l.data&&(r=l.url+=(rquery.test(r)?"&":"?")+l.data,delete l.data),l.cache===!1&&(l.url=rts.test(r)?r.replace(rts,"$1_="+nonce++):r+(rquery.test(r)?"&":"?")+"_="+nonce++)),l.ifModified&&(jQuery.lastModified[r]&&w.setRequestHeader("If-Modified-Since",jQuery.lastModified[r]),jQuery.etag[r]&&w.setRequestHeader("If-None-Match",jQuery.etag[r])),(l.data&&l.hasContent&&l.contentType!==!1||t.contentType)&&w.setRequestHeader("Content-Type",l.contentType),w.setRequestHeader("Accept",l.dataTypes[0]&&l.accepts[l.dataTypes[0]]?l.accepts[l.dataTypes[0]]+(l.dataTypes[0]!=="*"?", "+allTypes+"; q=0.01":""):l.accepts["*"]);for(f in l.headers)w.setRequestHeader(f,l.headers[f]);if(!l.beforeSend||l.beforeSend.call(c,w,l)!==!1&&y!==2){b="abort";for(f in{success:1,error:1,complete:1})w[f](l[f]);n=inspectPrefiltersOrTransports(transports,l,t,w);if(!n)S(-1,"No Transport");else{w.readyState=1,a&&h.trigger("ajaxSend",[w,l]),l.async&&l.timeout>0&&(o=setTimeout(function(){w.abort("timeout")},l.timeout));try{y=1,n.send(m,S)}catch(E){if(!(y<2))throw E;S(-1,E)}}return w}return w.abort()},getJSON:function(e,t,n){return jQuery.get(e,t,n,"json")},getScript:function(e,t){return jQuery.get(e,undefined,t,"script")}}),jQuery.each(["get","post"],function(e,t){jQuery[t]=function(e,n,r,i){return jQuery.isFunction(n)&&(i=i||r,r=n,n=undefined),jQuery.ajax({url:e,type:t,dataType:i,data:n,success:r})}}),jQuery.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(e,t){jQuery.fn[t]=function(e){return this.on(t,e)}}),jQuery._evalUrl=function(e){return jQuery.ajax({url:e,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})},jQuery.fn.extend({wrapAll:function(e){var t;return jQuery.isFunction(e)?this.each(function(t){jQuery(this).wrapAll(e.call(this,t))}):(this[0]&&(t=jQuery(e,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&t.insertBefore(this[0]),t.map(function(){var e=this;while(e.firstElementChild)e=e.firstElementChild;return e}).append(this)),this)},wrapInner:function(e){return jQuery.isFunction(e)?this.each(function(t){jQuery(this).wrapInner(e.call(this,t))}):this.each(function(){var t=jQuery(this),n=t.contents();n.length?n.wrapAll(e):t.append(e)})},wrap:function(e){var t=jQuery.isFunction(e);return this.each(function(n){jQuery(this).wrapAll(t?e.call(this,n):e)})},unwrap:function(){return this.parent().each(function(){jQuery.nodeName(this,"body")||jQuery(this).replaceWith(this.childNodes)}).end()}}),jQuery.expr.filters.hidden=function(e){return e.offsetWidth<=0&&e.offsetHeight<=0},jQuery.expr.filters.visible=function(e){return!jQuery.expr.filters.hidden(e)};var r20=/%20/g,rbracket=/\[\]$/,rCRLF=/\r?\n/g,rsubmitterTypes=/^(?:submit|button|image|reset|file)$/i,rsubmittable=/^(?:input|select|textarea|keygen)/i;jQuery.param=function(e,t){var n,r=[],i=function(e,t){t=jQuery.isFunction(t)?t():t==null?"":t,r[r.length]=encodeURIComponent(e)+"="+encodeURIComponent(t)};t===undefined&&(t=jQuery.ajaxSettings&&jQuery.ajaxSettings.traditional);if(jQuery.isArray(e)||e.jquery&&!jQuery.isPlainObject(e))jQuery.each(e,function(){i(this.name,this.value)});else for(n in e)buildParams(n,e[n],t,i);return r.join("&").replace(r20,"+")},jQuery.fn.extend({serialize:function(){return jQuery.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var e=jQuery.prop(this,"elements");return e?jQuery.makeArray(e):this}).filter(function(){var e=this.type;return this.name&&!jQuery(this).is(":disabled")&&rsubmittable.test(this.nodeName)&&!rsubmitterTypes.test(e)&&(this.checked||!rcheckableType.test(e))}).map(function(e,t){var n=jQuery(this).val();return n==null?null:jQuery.isArray(n)?jQuery.map(n,function(e){return{name:t.name,value:e.replace(rCRLF,"\r\n")}}):{name:t.name,value:n.replace(rCRLF,"\r\n")}}).get()}}),jQuery.ajaxSettings.xhr=function(){try{return new XMLHttpRequest}catch(e){}};var xhrId=0,xhrCallbacks={},xhrSuccessStatus={0:200,1223:204},xhrSupported=jQuery.ajaxSettings.xhr();window.ActiveXObject&&jQuery(window).on("unload",function(){for(var e in xhrCallbacks)xhrCallbacks[e]()}),support.cors=!!xhrSupported&&"withCredentials"in xhrSupported,support.ajax=xhrSupported=!!xhrSupported,jQuery.ajaxTransport(function(e){var t;if(support.cors||xhrSupported&&!e.crossDomain)return{send:function(n,r){var i,s=e.xhr(),o=++xhrId;s.open(e.type,e.url,e.async,e.username,e.password);if(e.xhrFields)for(i in e.xhrFields)s[i]=e.xhrFields[i];e.mimeType&&s.overrideMimeType&&s.overrideMimeType(e.mimeType),!e.crossDomain&&!n["X-Requested-With"]&&(n["X-Requested-With"]="XMLHttpRequest");for(i in n)s.setRequestHeader(i,n[i]);t=function(e){return function(){t&&(delete xhrCallbacks[o],t=s.onload=s.onerror=null,e==="abort"?s.abort():e==="error"?r(s.status,s.statusText):r(xhrSuccessStatus[s.status]||s.status,s.statusText,typeof s.responseText=="string"?{text:s.responseText}:undefined,s.getAllResponseHeaders()))}},s.onload=t(),s.onerror=t("error"),t=xhrCallbacks[o]=t("abort"),s.send(e.hasContent&&e.data||null)},abort:function(){t&&t()}}}),jQuery.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(e){return jQuery.globalEval(e),e}}}),jQuery.ajaxPrefilter("script",function(e){e.cache===undefined&&(e.cache=!1),e.crossDomain&&(e.type="GET")}),jQuery.ajaxTransport("script",function(e){if(e.crossDomain){var t,n;return{send:function(r,i){t=jQuery("<script>").prop({async:!0,charset:e.scriptCharset,src:e.url}).on("load error",n=function(e){t.remove(),n=null,e&&i(e.type==="error"?404:200,e.type)}),document.head.appendChild(t[0])},abort:function(){n&&n()}}}});var oldCallbacks=[],rjsonp=/(=)\?(?=&|$)|\?\?/;jQuery.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var e=oldCallbacks.pop()||jQuery.expando+"_"+nonce++;return this[e]=!0,e}}),jQuery.ajaxPrefilter("json jsonp",function(e,t,n){var r,i,s,o=e.jsonp!==!1&&(rjsonp.test(e.url)?"url":typeof e.data=="string"&&!(e.contentType||"").indexOf("application/x-www-form-urlencoded")&&rjsonp.test(e.data)&&"data");if(o||e.dataTypes[0]==="jsonp")return r=e.jsonpCallback=jQuery.isFunction(e.jsonpCallback)?e.jsonpCallback():e.jsonpCallback,o?e[o]=e[o].replace(rjsonp,"$1"+r):e.jsonp!==!1&&(e.url+=(rquery.test(e.url)?"&":"?")+e.jsonp+"="+r),e.converters["script json"]=function(){return s||jQuery.error(r+" was not called"),s[0]},e.dataTypes[0]="json",i=window[r],window[r]=function(){s=arguments},n.always(function(){window[r]=i,e[r]&&(e.jsonpCallback=t.jsonpCallback,oldCallbacks.push(r)),s&&jQuery.isFunction(i)&&i(s[0]),s=i=undefined}),"script"}),jQuery.parseHTML=function(e,t,n){if(!e||typeof e!="string")return null;typeof t=="boolean"&&(n=t,t=!1),t=t||document;var r=rsingleTag.exec(e),i=!n&&[];return r?[t.createElement(r[1])]:(r=jQuery.buildFragment([e],t,i),i&&i.length&&jQuery(i).remove(),jQuery.merge([],r.childNodes))};var _load=jQuery.fn.load;jQuery.fn.load=function(e,t,n){if(typeof e!="string"&&_load)return _load.apply(this,arguments);var r,i,s,o=this,u=e.indexOf(" ");return u>=0&&(r=e.slice(u),e=e.slice(0,u)),jQuery.isFunction(t)?(n=t,t=undefined):t&&typeof t=="object"&&(i="POST"),o.length>0&&jQuery.ajax({url:e,type:i,dataType:"html",data:t}).done(function(e){s=arguments,o.html(r?jQuery("<div>").append(jQuery.parseHTML(e)).find(r):e)}).complete(n&&function(e,t){o.each(n,s||[e.responseText,t,e])}),this},jQuery.expr.filters.animated=function(e){return jQuery.grep(jQuery.timers,function(t){return e===t.elem}).length};var docElem=window.document.documentElement;jQuery.offset={setOffset:function(e,t,n){var r,i,s,o,u,a,f,l=jQuery.css(e,"position"),c=jQuery(e),h={};l==="static"&&(e.style.position="relative"),u=c.offset(),s=jQuery.css(e,"top"),a=jQuery.css(e,"left"),f=(l==="absolute"||l==="fixed")&&(s+a).indexOf("auto")>-1,f?(r=c.position(),o=r.top,i=r.left):(o=parseFloat(s)||0,i=parseFloat(a)||0),jQuery.isFunction(t)&&(t=t.call(e,n,u)),t.top!=null&&(h.top=t.top-u.top+o),t.left!=null&&(h.left=t.left-u.left+i),"using"in t?t.using.call(e,h):c.css(h)}},jQuery.fn.extend({offset:function(e){if(arguments.length)return e===undefined?this:this.each(function(t){jQuery.offset.setOffset(this,e,t)});var t,n,r=this[0],i={top:0,left:0},s=r&&r.ownerDocument;if(!s)return;return t=s.documentElement,jQuery.contains(t,r)?(typeof r.getBoundingClientRect!==strundefined&&(i=r.getBoundingClientRect()),n=getWindow(s),{top:i.top+n.pageYOffset-t.clientTop,left:i.left+n.pageXOffset-t.clientLeft}):i},position:function(){if(!this[0])return;var e,t,n=this[0],r={top:0,left:0};return jQuery.css(n,"position")==="fixed"?t=n.getBoundingClientRect():(e=this.offsetParent(),t=this.offset(),jQuery.nodeName(e[0],"html")||(r=e.offset()),r.top+=jQuery.css(e[0],"borderTopWidth",!0),r.left+=jQuery.css(e[0],"borderLeftWidth",!0)),{top:t.top-r.top-jQuery.css(n,"marginTop",!0),left:t.left-r.left-jQuery.css(n,"marginLeft",!0)}},offsetParent:function(){return this.map(function(){var e=this.offsetParent||docElem;while(e&&!jQuery.nodeName(e,"html")&&jQuery.css(e,"position")==="static")e=e.offsetParent;return e||docElem})}}),jQuery.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(e,t){var n="pageYOffset"===t;jQuery.fn[e]=function(r){return access(this,function(e,r,i){var s=getWindow(e);if(i===undefined)return s?s[t]:e[r];s?s.scrollTo(n?window.pageXOffset:i,n?i:window.pageYOffset):e[r]=i},e,r,arguments.length,null)}}),jQuery.each(["top","left"],function(e,t){jQuery.cssHooks[t]=addGetHookIf(support.pixelPosition,function(e,n){if(n)return n=curCSS(e,t),rnumnonpx.test(n)?jQuery(e).position()[t]+"px":n})}),jQuery.each({Height:"height",Width:"width"},function(e,t){jQuery.each({padding:"inner"+e,content:t,"":"outer"+e},function(n,r){jQuery.fn[r]=function(r,i){var s=arguments.length&&(n||typeof r!="boolean"),o=n||(r===!0||i===!0?"margin":"border");return access(this,function(t,n,r){var i;return jQuery.isWindow(t)?t.document.documentElement["client"+e]:t.nodeType===9?(i=t.documentElement,Math.max(t.body["scroll"+e],i["scroll"+e],t.body["offset"+e],i["offset"+e],i["client"+e])):r===undefined?jQuery.css(t,n,o):jQuery.style(t,n,r,o)},t,s?r:undefined,s,null)}})}),jQuery.fn.size=function(){return this.length},jQuery.fn.andSelf=jQuery.fn.addBack,typeof define=="function"&&define.amd&&define("jquery",[],function(){return jQuery});var _jQuery=window.jQuery,_$=window.$;return jQuery.noConflict=function(e){return window.$===jQuery&&(window.$=_$),e&&window.jQuery===jQuery&&(window.jQuery=_jQuery),jQuery},typeof noGlobal===strundefined&&(window.jQuery=window.$=jQuery),jQuery}),define("popcorn-slides",["jquery","popcorn","screenfull"],function(e,t,n){t.plugin("iframe",{_setup:function(e){e._iframe=document.getElementById(e.target)},start:function(e,t){t._iframe.src=t.src,t._iframe.style.display="inline"}}),t.setupSlides=function(t,r){function o(e){return(e+"").split(":").reduce(function(e,t,n,r){t=parseInt(t,10);switch(n){case 0:return r.length===3?e+t*3600:e+t*60;case 1:return r.length===3?e+t*60:e+t;case 2:return e+t;default:return e}},0)}var i=e(".clermontjs-event-video-player"),s=e(".clermontjs-event-video-player-fullscreen");s.click(function(e){e.preventDefault(),n.toggle(i.get(0))}),n.enabled&&(e(".clermontjs-event-video-fullscreen-calout").show(),document.addEventListener(n.raw.fullscreenchange,function(){i.toggleClass("fullscreen",n.isFullscreen)})),r.tc.forEach(function(e,n){var i=n>=r.tc.length-1?null:r.tc[n+1].start;t.iframe({target:r.target,start:o(e.start),end:o(i),src:r.baseurl+(e.url||"")})})}}),define("video",["jquery","popcorn","popcorn-slides"],function(e,t){if(!e("[data-video]").length)return null;var n=e("[data-video]"),r=n.data("video"),i=n.data("slides"),s=n.data("tc"),o;r&&(o=t.youtube(".clermontjs-event-videocontainer","http://www.youtube.com/watch?html5=1&v="+r),t.setupSlides(o,{target:"clermontjs-event-slides-iframe",baseurl:i,tc:s}))}),window.Modernizr=function(e,t,n){function A(e){f.cssText=e}function O(e,t){return A(p.join(e+";")+(t||""))}function M(e,t){return typeof e===t}function _(e,t){return!!~(""+e).indexOf(t)}function D(e,t){for(var r in e){var i=e[r];if(!_(i,"-")&&f[i]!==n)return t=="pfx"?i:!0}return!1}function P(e,t,r){for(var i in e){var s=t[e[i]];if(s!==n)return r===!1?e[i]:M(s,"function")?s.bind(r||t):s}return!1}function H(e,t,n){var r=e.charAt(0).toUpperCase()+e.slice(1),i=(e+" "+v.join(r+" ")+r).split(" ");return M(t,"string")||M(t,"undefined")?D(i,t):(i=(e+" "+m.join(r+" ")+r).split(" "),P(i,t,n))}function B(){i.input=function(n){for(var r=0,i=n.length;r<i;r++)w[n[r]]=n[r]in l;return w.list&&(w.list=!!t.createElement("datalist")&&!!e.HTMLDataListElement),w}("autocomplete autofocus list placeholder max min multiple pattern required step".split(" ")),i.inputtypes=function(e){for(var r=0,i,s,u,a=e.length;r<a;r++)l.setAttribute("type",s=e[r]),i=l.type!=="text",i&&(l.value=c,l.style.cssText="position:absolute;visibility:hidden;",/^range$/.test(s)&&l.style.WebkitAppearance!==n?(o.appendChild(l),u=t.defaultView,i=u.getComputedStyle&&u.getComputedStyle(l,null).WebkitAppearance!=="textfield"&&l.offsetHeight!==0,o.removeChild(l)):/^(search|tel)$/.test(s)||(/^(url|email)$/.test(s)?i=l.checkValidity&&l.checkValidity()===!1:i=l.value!=c)),b[e[r]]=!!i;return b}("search tel url email datetime date month week time datetime-local number range color".split(" "))}var r="2.7.1",i={},s=!0,o=t.documentElement,u="modernizr",a=t.createElement(u),f=a.style,l=t.createElement("input"),c=":)",h={}.toString,p=" -webkit- -moz- -o- -ms- ".split(" "),d="Webkit Moz O ms",v=d.split(" "),m=d.toLowerCase().split(" "),g={svg:"http://www.w3.org/2000/svg"},y={},b={},w={},E=[],S=E.slice,x,T=function(e,n,r,i){var s,a,f,l,c=t.createElement("div"),h=t.body,p=h||t.createElement("body");if(parseInt(r,10))while(r--)f=t.createElement("div"),f.id=i?i[r]:u+(r+1),c.appendChild(f);return s=["&#173;",'<style id="s',u,'">',e,"</style>"].join(""),c.id=u,(h?c:p).innerHTML+=s,p.appendChild(c),h||(p.style.background="",p.style.overflow="hidden",l=o.style.overflow,o.style.overflow="hidden",o.appendChild(p)),a=n(c,e),h?c.parentNode.removeChild(c):(p.parentNode.removeChild(p),o.style.overflow=l),!!a},N=function(t){var n=e.matchMedia||e.msMatchMedia;if(n)return n(t).matches;var r;return T("@media "+t+" { #"+u+" { position: absolute; } }",function(t){r=(e.getComputedStyle?getComputedStyle(t,null):t.currentStyle)["position"]=="absolute"}),r},C=function(){function r(r,i){i=i||t.createElement(e[r]||"div"),r="on"+r;var s=r in i;return s||(i.setAttribute||(i=t.createElement("div")),i.setAttribute&&i.removeAttribute&&(i.setAttribute(r,""),s=M(i[r],"function"),M(i[r],"undefined")||(i[r]=n),i.removeAttribute(r))),i=null,s}var e={select:"input",change:"input",submit:"form",reset:"form",error:"img",load:"img",abort:"img"};return r}(),k={}.hasOwnProperty,L;!M(k,"undefined")&&!M(k.call,"undefined")?L=function(e,t){return k.call(e,t)}:L=function(e,t){return t in e&&M(e.constructor.prototype[t],"undefined")},Function.prototype.bind||(Function.prototype.bind=function(t){var n=this;if(typeof n!="function")throw new TypeError;var r=S.call(arguments,1),i=function(){if(this instanceof i){var e=function(){};e.prototype=n.prototype;var s=new e,o=n.apply(s,r.concat(S.call(arguments)));return Object(o)===o?o:s}return n.apply(t,r.concat(S.call(arguments)))};return i}),y.flexbox=function(){return H("flexWrap")},y.flexboxlegacy=function(){return H("boxDirection")},y.canvas=function(){var e=t.createElement("canvas");return!!e.getContext&&!!e.getContext("2d")},y.canvastext=function(){return!!i.canvas&&!!M(t.createElement("canvas").getContext("2d").fillText,"function")},y.webgl=function(){return!!e.WebGLRenderingContext},y.touch=function(){var n;return"ontouchstart"in e||e.DocumentTouch&&t instanceof DocumentTouch?n=!0:T(["@media (",p.join("touch-enabled),("),u,")","{#modernizr{top:9px;position:absolute}}"].join(""),function(e){n=e.offsetTop===9}),n},y.geolocation=function(){return"geolocation"in navigator},y.postmessage=function(){return!!e.postMessage},y.websqldatabase=function(){return!!e.openDatabase},y.indexedDB=function(){return!!H("indexedDB",e)},y.hashchange=function(){return C("hashchange",e)&&(t.documentMode===n||t.documentMode>7)},y.history=function(){return!!e.history&&!!history.pushState},y.draganddrop=function(){var e=t.createElement("div");return"draggable"in e||"ondragstart"in e&&"ondrop"in e},y.websockets=function(){return"WebSocket"in e||"MozWebSocket"in e},y.rgba=function(){return A("background-color:rgba(150,255,150,.5)"),_(f.backgroundColor,"rgba")},y.hsla=function(){return A("background-color:hsla(120,40%,100%,.5)"),_(f.backgroundColor,"rgba")||_(f.backgroundColor,"hsla")},y.multiplebgs=function(){return A("background:url(https://),url(https://),red url(https://)"),/(url\s*\(.*?){3}/.test(f.background)},y.backgroundsize=function(){return H("backgroundSize")},y.borderimage=function(){return H("borderImage")},y.borderradius=function(){return H("borderRadius")},y.boxshadow=function(){return H("boxShadow")},y.textshadow=function(){return t.createElement("div").style.textShadow===""},y.opacity=function(){return O("opacity:.55"),/^0.55$/.test(f.opacity)},y.cssanimations=function(){return H("animationName")},y.csscolumns=function(){return H("columnCount")},y.cssgradients=function(){var e="background-image:",t="gradient(linear,left top,right bottom,from(#9f9),to(white));",n="linear-gradient(left top,#9f9, white);";return A((e+"-webkit- ".split(" ").join(t+e)+p.join(n+e)).slice(0,-e.length)),_(f.backgroundImage,"gradient")},y.cssreflections=function(){return H("boxReflect")},y.csstransforms=function(){return!!H("transform")},y.csstransforms3d=function(){var e=!!H("perspective");return e&&"webkitPerspective"in o.style&&T("@media (transform-3d),(-webkit-transform-3d){#modernizr{left:9px;position:absolute;height:3px;}}",function(t,n){e=t.offsetLeft===9&&t.offsetHeight===3}),e},y.csstransitions=function(){return H("transition")},y.fontface=function(){var e;return T('@font-face {font-family:"font";src:url("https://")}',function(n,r){var i=t.getElementById("smodernizr"),s=i.sheet||i.styleSheet,o=s?s.cssRules&&s.cssRules[0]?s.cssRules[0].cssText:s.cssText||"":"";e=/src/i.test(o)&&o.indexOf(r.split(" ")[0])===0}),e},y.generatedcontent=function(){var e;return T(["#",u,"{font:0/0 a}#",u,':after{content:"',c,'";visibility:hidden;font:3px/1 a}'].join(""),function(t){e=t.offsetHeight>=3}),e},y.video=function(){var e=t.createElement("video"),n=!1;try{if(n=!!e.canPlayType)n=new Boolean(n),n.ogg=e.canPlayType('video/ogg; codecs="theora"').replace(/^no$/,""),n.h264=e.canPlayType('video/mp4; codecs="avc1.42E01E"').replace(/^no$/,""),n.webm=e.canPlayType('video/webm; codecs="vp8, vorbis"').replace(/^no$/,"")}catch(r){}return n},y.audio=function(){var e=t.createElement("audio"),n=!1;try{if(n=!!e.canPlayType)n=new Boolean(n),n.ogg=e.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/,""),n.mp3=e.canPlayType("audio/mpeg;").replace(/^no$/,""),n.wav=e.canPlayType('audio/wav; codecs="1"').replace(/^no$/,""),n.m4a=(e.canPlayType("audio/x-m4a;")||e.canPlayType("audio/aac;")).replace(/^no$/,"")}catch(r){}return n},y.localstorage=function(){try{return localStorage.setItem(u,u),localStorage.removeItem(u),!0}catch(e){return!1}},y.sessionstorage=function(){try{return sessionStorage.setItem(u,u),sessionStorage.removeItem(u),!0}catch(e){return!1}},y.webworkers=function(){return!!e.Worker},y.applicationcache=function(){return!!e.applicationCache},y.svg=function(){return!!t.createElementNS&&!!t.createElementNS(g.svg,"svg").createSVGRect},y.inlinesvg=function(){var e=t.createElement("div");return e.innerHTML="<svg/>",(e.firstChild&&e.firstChild.namespaceURI)==g.svg},y.smil=function(){return!!t.createElementNS&&/SVGAnimate/.test(h.call(t.createElementNS(g.svg,"animate")))},y.svgclippaths=function(){return!!t.createElementNS&&/SVGClipPath/.test(h.call(t.createElementNS(g.svg,"clipPath")))};for(var j in y)L(y,j)&&(x=j.toLowerCase(),i[x]=y[j](),E.push((i[x]?"":"no-")+x));return i.input||B(),i.addTest=function(e,t){if(typeof e=="object")for(var r in e)L(e,r)&&i.addTest(r,e[r]);else{e=e.toLowerCase();if(i[e]!==n)return i;t=typeof t=="function"?t():t,typeof s!="undefined"&&s&&(o.className+=" "+(t?"":"no-")+e),i[e]=t}return i},A(""),a=l=null,function(e,t){function c(e,t){var n=e.createElement("p"),r=e.getElementsByTagName("head")[0]||e.documentElement;return n.innerHTML="x<style>"+t+"</style>",r.insertBefore(n.lastChild,r.firstChild)}function h(){var e=y.elements;return typeof e=="string"?e.split(" "):e}function p(e){var t=f[e[u]];return t||(t={},a++,e[u]=a,f[a]=t),t}function d(e,n,r){n||(n=t);if(l)return n.createElement(e);r||(r=p(n));var o;return r.cache[e]?o=r.cache[e].cloneNode():s.test(e)?o=(r.cache[e]=r.createElem(e)).cloneNode():o=r.createElem(e),o.canHaveChildren&&!i.test(e)&&!o.tagUrn?r.frag.appendChild(o):o}function v(e,n){e||(e=t);if(l)return e.createDocumentFragment();n=n||p(e);var r=n.frag.cloneNode(),i=0,s=h(),o=s.length;for(;i<o;i++)r.createElement(s[i]);return r}function m(e,t){t.cache||(t.cache={},t.createElem=e.createElement,t.createFrag=e.createDocumentFragment,t.frag=t.createFrag()),e.createElement=function(n){return y.shivMethods?d(n,e,t):t.createElem(n)},e.createDocumentFragment=Function("h,f","return function(){var n=f.cloneNode(),c=n.createElement;h.shivMethods&&("+h().join().replace(/[\w\-]+/g,function(e){return t.createElem(e),t.frag.createElement(e),'c("'+e+'")'})+");return n}")(y,t.frag)}function g(e){e||(e=t);var n=p(e);return y.shivCSS&&!o&&!n.hasCSS&&(n.hasCSS=!!c(e,"article,aside,dialog,figcaption,figure,footer,header,hgroup,main,nav,section{display:block}mark{background:#FF0;color:#000}template{display:none}")),l||m(e,n),e}var n="3.7.0",r=e.html5||{},i=/^<|^(?:button|map|select|textarea|object|iframe|option|optgroup)$/i,s=/^(?:a|b|code|div|fieldset|h1|h2|h3|h4|h5|h6|i|label|li|ol|p|q|span|strong|style|table|tbody|td|th|tr|ul)$/i,o,u="_html5shiv",a=0,f={},l;(function(){try{var e=t.createElement("a");e.innerHTML="<xyz></xyz>",o="hidden"in e,l=e.childNodes.length==1||function(){t.createElement("a");var e=t.createDocumentFragment();return typeof e.cloneNode=="undefined"||typeof e.createDocumentFragment=="undefined"||typeof e.createElement=="undefined"}()}catch(n){o=!0,l=!0}})();var y={elements:r.elements||"abbr article aside audio bdi canvas data datalist details dialog figcaption figure footer header hgroup main mark meter nav output progress section summary template time video",version:n,shivCSS:r.shivCSS!==!1,supportsUnknownElements:l,shivMethods:r.shivMethods!==!1,type:"default",shivDocument:g,createElement:d,createDocumentFragment:v};e.html5=y,g(t)}(this,t),i._version=r,i._prefixes=p,i._domPrefixes=m,i._cssomPrefixes=v,i.mq=N,i.hasEvent=C,i.testProp=function(e){return D([e])},i.testAllProps=H,i.testStyles=T,i.prefixed=function(e,t,n){return t?H(e,t,n):H(e,"pfx")},o.className=o.className.replace(/(^|\s)no-js(\s|$)/,"$1$2")+(s?" js "+E.join(" "):""),i}(this,this.document),define("modernizr",function(e){return function(){var t,n;return t||e.Modernizr}}(this)),FastClick.prototype.deviceIsAndroid=navigator.userAgent.indexOf("Android")>0,FastClick.prototype.deviceIsIOS=/iP(ad|hone|od)/.test(navigator.userAgent),FastClick.prototype.deviceIsIOS4=FastClick.prototype.deviceIsIOS&&/OS 4_\d(_\d)?/.test(navigator.userAgent),FastClick.prototype.deviceIsIOSWithBadTarget=FastClick.prototype.deviceIsIOS&&/OS ([6-9]|\d{2})_\d/.test(navigator.userAgent),FastClick.prototype.needsClick=function(e){switch(e.nodeName.toLowerCase()){case"button":case"select":case"textarea":if(e.disabled)return!0;break;case"input":if(this.deviceIsIOS&&e.type==="file"||e.disabled)return!0;break;case"label":case"video":return!0}return/\bneedsclick\b/.test(e.className)},FastClick.prototype.needsFocus=function(e){switch(e.nodeName.toLowerCase()){case"textarea":return!0;case"select":return!this.deviceIsAndroid;case"input":switch(e.type){case"button":case"checkbox":case"file":case"image":case"radio":case"submit":return!1}return!e.disabled&&!e.readOnly;default:return/\bneedsfocus\b/.test(e.className)}},FastClick.prototype.sendClick=function(e,t){var n,r;document.activeElement&&document.activeElement!==e&&document.activeElement.blur(),r=t.changedTouches[0],n=document.createEvent("MouseEvents"),n.initMouseEvent(this.determineEventType(e),!0,!0,window,1,r.screenX,r.screenY,r.clientX,r.clientY,!1,!1,!1,!1,0,null),n.forwardedTouchEvent=!0,e.dispatchEvent(n)},FastClick.prototype.determineEventType=function(e){return this.deviceIsAndroid&&e.tagName.toLowerCase()==="select"?"mousedown":"click"},FastClick.prototype.focus=function(e){var t;this.deviceIsIOS&&e.setSelectionRange&&e.type.indexOf("date")!==0&&e.type!=="time"?(t=e.value.length,e.setSelectionRange(t,t)):e.focus()},FastClick.prototype.updateScrollParent=function(e){var t,n;t=e.fastClickScrollParent;if(!t||!t.contains(e)){n=e;do{if(n.scrollHeight>n.offsetHeight){t=n,e.fastClickScrollParent=n;break}n=n.parentElement}while(n)}t&&(t.fastClickLastScrollTop=t.scrollTop)},FastClick.prototype.getTargetElementFromEventTarget=function(e){return e.nodeType===Node.TEXT_NODE?e.parentNode:e},FastClick.prototype.onTouchStart=function(e){var t,n,r;if(e.targetTouches.length>1)return!0;t=this.getTargetElementFromEventTarget(e.target),n=e.targetTouches[0];if(this.deviceIsIOS){r=window.getSelection();if(r.rangeCount&&!r.isCollapsed)return!0;if(!this.deviceIsIOS4){if(n.identifier===this.lastTouchIdentifier)return e.preventDefault(),!1;this.lastTouchIdentifier=n.identifier,this.updateScrollParent(t)}}return this.trackingClick=!0,this.trackingClickStart=e.timeStamp,this.targetElement=t,this.touchStartX=n.pageX,this.touchStartY=n.pageY,e.timeStamp-this.lastClickTime<200&&e.preventDefault(),!0},FastClick.prototype.touchHasMoved=function(e){var t=e.changedTouches[0],n=this.touchBoundary;return Math.abs(t.pageX-this.touchStartX)>n||Math.abs(t.pageY-this.touchStartY)>n?!0:!1},FastClick.prototype.onTouchMove=function(e){if(!this.trackingClick)return!0;if(this.targetElement!==this.getTargetElementFromEventTarget(e.target)||this.touchHasMoved(e))this.trackingClick=!1,this.targetElement=null;return!0},FastClick.prototype.findControl=function(e){return e.control!==undefined?e.control:e.htmlFor?document.getElementById(e.htmlFor):e.querySelector("button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea")},FastClick.prototype.onTouchEnd=function(e){var t,n,r,i,s,o=this.targetElement;if(!this.trackingClick)return!0;if(e.timeStamp-this.lastClickTime<200)return this.cancelNextClick=!0,!0;this.cancelNextClick=!1,this.lastClickTime=e.timeStamp,n=this.trackingClickStart,this.trackingClick=!1,this.trackingClickStart=0,this.deviceIsIOSWithBadTarget&&(s=e.changedTouches[0],o=document.elementFromPoint(s.pageX-window.pageXOffset,s.pageY-window.pageYOffset)||o,o.fastClickScrollParent=this.targetElement.fastClickScrollParent),r=o.tagName.toLowerCase();if(r==="label"){t=this.findControl(o);if(t){this.focus(o);if(this.deviceIsAndroid)return!1;o=t}}else if(this.needsFocus(o)){if(e.timeStamp-n>100||this.deviceIsIOS&&window.top!==window&&r==="input")return this.targetElement=null,!1;this.focus(o),this.sendClick(o,e);if(!this.deviceIsIOS4||r!=="select")this.targetElement=null,e.preventDefault();return!1}if(this.deviceIsIOS&&!this.deviceIsIOS4){i=o.fastClickScrollParent;if(i&&i.fastClickLastScrollTop!==i.scrollTop)return!0}return this.needsClick(o)||(e.preventDefault(),this.sendClick(o,e)),!1},FastClick.prototype.onTouchCancel=function(){this.trackingClick=!1,this.targetElement=null},FastClick.prototype.onMouse=function(e){return this.targetElement?e.forwardedTouchEvent?!0:e.cancelable?!this.needsClick(this.targetElement)||this.cancelNextClick?(e.stopImmediatePropagation?e.stopImmediatePropagation():e.propagationStopped=!0,e.stopPropagation(),e.preventDefault(),!1):!0:!0:!0},FastClick.prototype.onClick=function(e){var t;return this.trackingClick?(this.targetElement=null,this.trackingClick=!1,!0):e.target.type==="submit"&&e.detail===0?!0:(t=this.onMouse(e),t||(this.targetElement=null),t)},FastClick.prototype.destroy=function(){var e=this.layer;this.deviceIsAndroid&&(e.removeEventListener("mouseover",this.onMouse,!0),e.removeEventListener("mousedown",this.onMouse,!0),e.removeEventListener("mouseup",this.onMouse,!0)),e.removeEventListener("click",this.onClick,!0),e.removeEventListener("touchstart",this.onTouchStart,!1),e.removeEventListener("touchmove",this.onTouchMove,!1),e.removeEventListener("touchend",this.onTouchEnd,!1),e.removeEventListener("touchcancel",this.onTouchCancel,!1)},FastClick.notNeeded=function(e){var t,n;if(typeof window.ontouchstart=="undefined")return!0;n=+(/Chrome\/([0-9]+)/.exec(navigator.userAgent)||[,0])[1];if(n){if(!FastClick.prototype.deviceIsAndroid)return!0;t=document.querySelector("meta[name=viewport]");if(t){if(t.content.indexOf("user-scalable=no")!==-1)return!0;if(n>31&&window.innerWidth<=window.screen.width)return!0}}return e.style.msTouchAction==="none"?!0:!1},FastClick.attach=function(e){return new FastClick(e)},typeof define!="undefined"&&define.amd?define("fastclick",[],function(){return FastClick}):typeof module!="undefined"&&module.exports?(module.exports=FastClick.attach,module.exports.FastClick=FastClick):window.FastClick=FastClick,function(e,t,n,r){function l(e){if(typeof e=="string"||e instanceof String)e=e.replace(/^['\\/"]+|(;\s?})+|['\\/"]+$/g,"");return e}var i=function(t){var n=t.length;while(n--)e("head").has("."+t[n]).length===0&&e("head").append('<meta class="'+t[n]+'">')};i(["foundation-mq-small","foundation-mq-medium","foundation-mq-large","foundation-mq-xlarge","foundation-mq-xxlarge","foundation-data-attribute-namespace"]),e(function(){typeof FastClick!="undefined"&&typeof n.body!="undefined"&&FastClick.attach(n.body)});var s=function(t,r){if(typeof t=="string"){if(r){var i;return r.jquery?i=r[0]:i=r,e(i.querySelectorAll(t))}return e(n.querySelectorAll(t))}return e(t,r)},o=function(e){var t=[];return e||t.push("data"),this.namespace.length>0&&t.push(this.namespace),t.push(this.name),t.join("-")},i=function(t){var n=t.length;while(n--)e("head").has("."+t[n]).length===0&&e("head").append('<meta class="'+t[n]+'">')},u=function(e){var t=e.split("-"),n=t.length,r=[];while(n--)n!==0?r.push(t[n]):this.namespace.length>0?r.push(this.namespace,t[n]):r.push(t[n]);return r.reverse().join("-")},a=function(t,n){var r=this,i=!s(this).data(this.attr_name(!0));if(typeof t=="string")return this[t].call(this,n);s(this.scope).is("["+this.attr_name()+"]")?(s(this.scope).data(this.attr_name(!0)+"-init",e.extend({},this.settings,n||t,this.data_options(s(this.scope)))),i&&this.events(this.scope)):s("["+this.attr_name()+"]",this.scope).each(function(){var i=!s(this).data(r.attr_name(!0)+"-init");s(this).data(r.attr_name(!0)+"-init",e.extend({},r.settings,n||t,r.data_options(s(this)))),i&&r.events(this)})},f=function(e,t){function n(){t(e[0])}function r(){this.one("load",n);if(/MSIE (\d+\.\d+);/.test(navigator.userAgent)){var e=this.attr("src"),t=e.match(/\?/)?"&":"?";t+="random="+(new Date).getTime(),this.attr("src",e+t)}}if(!e.attr("src")){n();return}e[0].complete||e[0].readyState===4?n():r.call(e)};t.matchMedia=t.matchMedia||function(e,t){var n,r=e.documentElement,i=r.firstElementChild||r.firstChild,s=e.createElement("body"),o=e.createElement("div");return o.id="mq-test-1",o.style.cssText="position:absolute;top:-100em",s.style.background="none",s.appendChild(o),function(e){return o.innerHTML='&shy;<style media="'+e+'"> #mq-test-1 { width: 42px; }</style>',r.insertBefore(s,i),n=o.offsetWidth===42,r.removeChild(s),{matches:n,media:e}}}(n),function(e){function u(){n&&(s(u),jQuery.fx.tick())}var n,r=0,i=["webkit","moz"],s=t.requestAnimationFrame,o=t.cancelAnimationFrame;for(;r<i.length&&!s;r++)s=t[i[r]+"RequestAnimationFrame"],o=o||t[i[r]+"CancelAnimationFrame"]||t[i[r]+"CancelRequestAnimationFrame"];s?(t.requestAnimationFrame=s,t.cancelAnimationFrame=o,jQuery.fx.timer=function(e){e()&&jQuery.timers.push(e)&&!n&&(n=!0,u())},jQuery.fx.stop=function(){n=!1}):(t.requestAnimationFrame=function(e,n){var i=(new Date).getTime(),s=Math.max(0,16-(i-r)),o=t.setTimeout(function(){e(i+s)},s);return r=i+s,o},t.cancelAnimationFrame=function(e){clearTimeout(e)})}(jQuery),t.Foundation={name:"Foundation",version:"5.1.1",media_queries:{small:s(".foundation-mq-small").css("font-family").replace(/^[\/\\'"]+|(;\s?})+|[\/\\'"]+$/g,""),medium:s(".foundation-mq-medium").css("font-family").replace(/^[\/\\'"]+|(;\s?})+|[\/\\'"]+$/g,""),large:s(".foundation-mq-large").css("font-family").replace(/^[\/\\'"]+|(;\s?})+|[\/\\'"]+$/g,""),xlarge:s(".foundation-mq-xlarge").css("font-family").replace(/^[\/\\'"]+|(;\s?})+|[\/\\'"]+$/g,""),xxlarge:s(".foundation-mq-xxlarge").css("font-family").replace(/^[\/\\'"]+|(;\s?})+|[\/\\'"]+$/g,"")},stylesheet:e("<style></style>").appendTo("head")[0].sheet,global:{namespace:""},init:function(e,t,n,r,i){var o,u=[e,n,r,i],a=[];this.rtl=/rtl/i.test(s("html").attr("dir")),this.scope=e||this.scope,this.set_namespace();if(t&&typeof t=="string"&&!/reflow/i.test(t))this.libs.hasOwnProperty(t)&&a.push(this.init_lib(t,u));else for(var f in this.libs)a.push(this.init_lib(f,t));return e},init_lib:function(e,t){return this.libs.hasOwnProperty(e)?(this.patch(this.libs[e]),t&&t.hasOwnProperty(e)?this.libs[e].init.apply(this.libs[e],[this.scope,t[e]]):(t=t instanceof Array?t:Array(t),this.libs[e].init.apply(this.libs[e],t))):function(){}},patch:function(e){e.scope=this.scope,e.namespace=this.global.namespace,e.rtl=this.rtl,e.data_options=this.utils.data_options,e.attr_name=o,e.add_namespace=u,e.bindings=a,e.S=this.utils.S},inherit:function(e,t){var n=t.split(" "),r=n.length;while(r--)this.utils.hasOwnProperty(n[r])&&(e[n[r]]=this.utils[n[r]])},set_namespace:function(){var t=e(".foundation-data-attribute-namespace").css("font-family");if(/false/i.test(t))return;this.global.namespace=t},libs:{},utils:{S:s,throttle:function(e,t){var n=null;return function(){var r=this,i=arguments;clearTimeout(n),n=setTimeout(function(){e.apply(r,i)},t)}},debounce:function(e,t,n){var r,i;return function(){var s=this,o=arguments,u=function(){r=null,n||(i=e.apply(s,o))},a=n&&!r;return clearTimeout(r),r=setTimeout(u,t),a&&(i=e.apply(s,o)),i}},data_options:function(t){function a(e){return!isNaN(e-0)&&e!==null&&e!==""&&e!==!1&&e!==!0}function f(t){return typeof t=="string"?e.trim(t):t}var n={},r,i,s,o=function(e){var t=Foundation.global.namespace;return t.length>0?e.data(t+"-options"):e.data("options")},u=o(t);if(typeof u=="object")return u;s=(u||":").split(";"),r=s.length;while(r--)i=s[r].split(":"),/true/i.test(i[1])&&(i[1]=!0),/false/i.test(i[1])&&(i[1]=!1),a(i[1])&&(i[1]=parseInt(i[1],10)),i.length===2&&i[0].length>0&&(n[f(i[0])]=f(i[1]));return n},register_media:function(t,n){Foundation.media_queries[t]===r&&(e("head").append('<meta class="'+n+'">'),Foundation.media_queries[t]=l(e("."+n).css("font-family")))},add_custom_rule:function(e,t){if(t===r)Foundation.stylesheet.insertRule(e,Foundation.stylesheet.cssRules.length);else{var n=Foundation.media_queries[t];n!==r&&Foundation.stylesheet.insertRule("@media "+Foundation.media_queries[t]+"{ "+e+" }")}},image_loaded:function(e,t){var n=this,r=e.length;e.each(function(){f(n.S(this),function(){r-=1,r==0&&t(e)})})},random_str:function(e){var t="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");e||(e=Math.floor(Math.random()*t.length));var n="";while(e--)n+=t[Math.floor(Math.random()*t.length)];return n}}},e.fn.foundation=function(){var e=Array.prototype.slice.call(arguments,0);return this.each(function(){return Foundation.init.apply(Foundation,[this].concat(e)),this})}}(jQuery,this,this.document),define("foundation/foundation",["jquery","modernizr","fastclick"],function(e){return function(){var t,n;return t||e.jQuery}}(this)),define("foundation",["foundation/foundation"],function(e){e(function(){e(document).foundation()})}),require(["jquery","video","foundation"],function(){}),define("kernel",function(){});