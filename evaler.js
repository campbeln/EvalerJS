/*
EvalerJS v0.5f http://opensourcetaekwondo.com/evaler/
(c) 2014-2015 Nick Campbell cjsssdev@gmail.com
License: MIT
*/
//# SCRIPT tag versus eval - http://stackoverflow.com/questions/8380204/is-there-a-performance-gain-in-including-script-tags-as-opposed-to-using-eval , http://jsperf.com/dynamic-script-tag-with-src-vs-xhr-eval-vs-xhr-inline-s/4
(function (_window, _document, fnEvalerFactory, fnLocalEvaler, fnUseStrictEvaler, fnSandboxEvalerFactory) {
    "use strict";

    //# Setup the $services required by the evalers
    var _Object_prototype_toString = Object.prototype.toString,
        $services = {
            is: {
                fn: function (f) {
                    return (_Object_prototype_toString.call(f) === '[object Function]');
                },
                obj: function (o) {
                    return (o && o === Object(o) && !$services.is.fn(o));
                },
                arr: function (a) {
                    return (_Object_prototype_toString.call(a) === '[object Array]');
                }
            },
            newId: function (sPrefix) {
                var sRandom = "";
                //sPrefix = sPrefix || evaler

                //# While the sPrefix + sRandom exists as an ID in the _document, try to find a unique ID returning the first we find
                while (_document.getElementById(sPrefix + sRandom)) {
                    sRandom = Math.random().toString(36).substr(2, 5);
                }
                return sPrefix + sRandom;
            }
        }
    ;

    //# Run the fnEvalerFactory, setting its result into window.evaler
    _window.evaler = fnEvalerFactory(_window, _document, $services, fnLocalEvaler, fnUseStrictEvaler, fnSandboxEvalerFactory);
})(
    window,
    document,
    //# fnEvalerFactory function. Base factory for the evaler logic
    function (_window, _document, $services, fnLocalEvaler, fnUseStrictEvaler, fnSandboxEvalerFactory) {
        "use strict";

        var fnJSONParse,
            sVersion = "v0.5f",
            fnGlobalEvaler = null
        ;

        //# Optionally returns a Javascript string or sets up the fnGlobalEvaler to access the global version of eval
        function getGlobalEvaler(bCode) {
            //# Build the Javascript code that safely collects the global version of eval
            //#     NOTE: A fallback function is recommended as in some edge cases this function can return `undefined`
            //#     NOTE: Based on http://perfectionkills.com/global-eval-what-are-the-options/#the_problem_with_geval_windowexecscript_eval
            var sGetGlobalEval =
                    "try{" +
                        "return(function(g,Object){" +
                            "return((1,eval)('Object')===g" +
                                "?function(){return(1,eval)(arguments[0]);}" +
                                ":(window.execScript?function(){return window.execScript(arguments[0]);}:undefined)" +
                            ");" +
                        "})(Object,{});" +
                    "}catch(e){return undefined;}"
            ;

            //# If we are supposed to return the bCode, do so now
            if (bCode) {
                return sGetGlobalEval;
            }
            //# Else if we haven't setup the fnGlobalEvaler yet, do so now
            //#     NOTE: A function defined by a Function() constructor does not inherit any scope other than the global scope (which all functions inherit), even though we are not using this paticular feature (as getGlobalEvaler get's the global version of eval)
            else if (fnGlobalEvaler === null) {
                fnGlobalEvaler = new Function(sGetGlobalEval)();
            }
        } //# getGlobalEvaler


        //# Factory function that configures and returns a looper function for the passed fnEval and oContext
        function looperFactory(fnEval, oContext, bInContext) {
            //# Return the configured .looper function to the caller
            return function (vJS, oInject, bReturnObject) {
                var i,
                    bAsArray = $services.is.arr(vJS),
                    bInjections = $services.is.obj(oInject),
                    oReturnVal = {
                        js: (bAsArray ? vJS : [vJS]),
                        results: [],
                        errors: []
                    }
                ;

                //# If we have a oContext and the passed oInject .is.obj
                if (oContext && bInjections) {
                    //# Traverse oInject, setting each .hasOwnProperty into the oContext (leaving oContext's current definition if there is one)
                    for (i in oInject) {
                        if (oContext[i] === undefined && oInject.hasOwnProperty(i)) {
                            oContext[i] = oInject[i];
                        }
                    }
                }

                //# Determine the type of fnEval and process accordingly
                switch (fnEval) {
                    case fnLocalEvaler:
                    case fnUseStrictEvaler: {
                        //# As this is either a fnLocalEvaler or fnUseStrictEvaler, we need to let them traverse the .js and non-oContext oInject'ions, so call them accordingly
                        //#     NOTE: oReturnVal is updated byref, so there is no need to collect a return value
                        fnEval(oReturnVal, i, {
                            inject: (!bInContext && bInjections ? oInject : {}),
                            context: (bInContext ? oContext : undefined)
                        });
                        break;
                    }
                    default: {
                        //# Traverse the .js, .pushing each fnEval .results into our oReturnVal (optionally .call'ing bInContext if necessary as we go)
                        for (i = 0; i < oReturnVal.js.length; i++) {
                            try {
                                oReturnVal.results.push(bInContext ? fnEval.call(oContext, oReturnVal.js[i]) : fnEval(oReturnVal.js[i]));
                            } catch (e) {
                                //# An error occured fnEval'ing the current i(ndex), so .push undefined into this i(ndex)'s entry in .results and log the .errors
                                oReturnVal.results.push(undefined);
                                oReturnVal.errors.push({ index: i, error: e, js: oReturnVal.js[i] });
                            }
                        }
                    }
                }

                //# If we are supposed to bReturnObject return our oReturnVal, else only return the .results (either bAsArray or just the first index)
                return (bReturnObject ? oReturnVal : (bAsArray ? oReturnVal.results : oReturnVal.results[0]));
            };
        } //# looperFactory


        //# Adds an IFRAME to the DOM based on the passed sSandboxAttr and sURL
        function iframeFactory(sSandboxAttr, sURL, $domTarget) {
            var sID = $services.newId("sandbox");

            //# As long as the caller didn't request an IFRAME without a sandbox attribute, reset sSandboxAttr to an attribute definition
            sSandboxAttr = (sSandboxAttr === null
                ? ''
                : ' sandbox="' + (sSandboxAttr ? sSandboxAttr : "allow-scripts") + '"'
            );

            //# .insertAdjacentHTML IFRAME at the beginning of the .body (or .head)
            //#     NOTE: In order to avoid polyfilling .outerHTML, we simply hard-code the IFRAME code below
            //#     TODO: Optionally calculate sURL based on the script path
            ($domTarget || _document.body || _document.head || _document.getElementsByTagName("head")[0])
                .insertAdjacentHTML('afterbegin', '<iframe src="' + sURL + '" id="' + sID + '" style="display:none;"' + sSandboxAttr + '></iframe>')
            ;

            //# Return the $iframe object to the caller
            return _document.getElementById(sID);
        } //# iframeFactory


        //# Factory function that returns a looper function for the requested evaluation eMode, oContext and oConfig
        function evalerFactory(eMode, oContext, oConfig) {
            var fnEvaler,
                bContextPassed = (oContext !== undefined && oContext !== null)
            ;

            //# Default the oContext to _window if it wasn't passed
            oContext = (bContextPassed ? oContext : _window);

            //# Determine the eMode and process accordingly
            switch (eMode/*.substr(0, 1).toLowerCase()*/) {
                //# global
                case "g": {
                    //# If this is a request for the current _window
                    if (oContext === _window) {
                        //# Ensure the fnGlobalEvaler has been setup, then safely set it (or optionally fnLocalEvaler if we are to .f(allback)) into fnEvaler
                        getGlobalEvaler();
                        fnEvaler = (!fnGlobalEvaler && oConfig.f ? fnLocalEvaler : fnGlobalEvaler);

                        //# If we were able to collect an fnEvaler above, return the configured looper
                        if (fnEvaler) {
                            return looperFactory(fnEvaler, _window/*, false*/);
                        }
                    }
                        //# Else if the passed oContext has an .eval function
                    else if ($services.is.fn(oContext.eval)) {
                        //# Attempt to collect the foreign fnGlobalEvaler, then safely set it (or optionally the foreign fnLocalEvaler if we are to .f(allback)) into fnEvaler
                        fnEvaler = oContext.eval("(function(){" + getGlobalEvaler(true) + "})()");
                        fnEvaler = (!fnEvaler && oConfig.f ? function (/* sJS */) { return oContext.eval(arguments[0]); } : fnEvaler);

                        //# If we were able to collect an fnEvaler above, return the configured looper (or the fnEvaler if this is a .r(ecursiveCall))
                        if (fnEvaler) {
                            return (oConfig.r ? fnEvaler : looperFactory(fnEvaler, oContext/*, false*/));
                        }
                    }
                    //# Else the passed oContext is not valid for a global request, so return undefined
                    //#     NOTE: The code below isn't actually necessary as this is the default behavior of a function with no defined return
                    //else {
                    //    return undefined;
                    //}
                    break;
                }
                //# local
                case "l": {
                    return looperFactory(fnLocalEvaler, oContext, bContextPassed);
                    //break;
                }
                //# "use strict"
                case "u": {
                    return looperFactory(fnUseStrictEvaler, oContext, bContextPassed);
                    //break;
                }
                //# isolated
                case "i": {
                    //# Ensure the passed oConfig .is.obj, then build the IFRAME and collect its .contentWindow
                    //#     NOTE: We send null into .iframeFactory rather than "allow-scripts allow-same-origin" as browsers log a warning when this combo is set, and as this is simply an isolated (rather than a sandboxed) scope the code is trusted, but needs to have its own environment
                    oConfig = ($services.is.obj(oConfig) ? oConfig : {});
                    oConfig.iframe = iframeFactory(null, "" /*, undefined*/);
                    oConfig.window = oConfig.iframe.contentWindow;

                    //# Recurse to collect the isolated .window's fnEvaler (signaling to .f(allback) and that we are .r(ecursing))
                    fnEvaler = evalerFactory("g", oConfig.window, { f: 1, r: 1 });

                    //# Return the configured looper, defaulting oContext to the $sandboxWin if !bContextPassed
                    //#     NOTE: Since we default oContext to _window above, we need to look at bContextPassed to send the correct second argument
                    return looperFactory(fnEvaler, (bContextPassed ? oContext : oConfig.window), bContextPassed);
                    //break;
                }
                //# json
                case "j": {
                    //# JSON.parse never allows for oInject'ions nor a oContext, so never pass a oContext into the .looperFactory (which in turn locks out oInject'ions)
                    return looperFactory(fnJSONParse/*, undefined, false*/);
                    //break;
                }
            }
        } //# evalerFactory


        //# If the native JSON.parse is available, set fnJSONParse to it
        if (_window.JSON && _window.JSON.parse) {
            fnJSONParse = _window.JSON.parse;
        }
            //# Else if $jQuery's .parseJSON is available, set fnJSONParse to it
        else if (_window.jQuery && _window.jQuery.parseJSON) {
            fnJSONParse = _window.jQuery.parseJSON;
        }

        //# Configure and return our return value
        return {
            version: sVersion,
            global: function (bFallback, $window) {
                return evalerFactory("g", $window || _window, { f: bFallback });
            },
            local: (!fnLocalEvaler ? undefined : function (oContext) {
                return evalerFactory("l", oContext /*, {}*/);
            }),
            useStrict: (!fnUseStrictEvaler ? undefined : function (oContext) {
                return evalerFactory("u", oContext /*, {}*/);
            }),
            isolated: function (oContext, oReturnedByRef) {
                return evalerFactory("i", oContext, oReturnedByRef);
            },
            json: (!fnJSONParse ? undefined : function () {
                return evalerFactory("j" /*, undefined, {}*/);
            }),
            sandbox: (!fnSandboxEvalerFactory
                ? undefined
                : fnSandboxEvalerFactory(_window, $services, { looper: looperFactory, iframe: iframeFactory })
            )
        };
    },
    //# fnLocalEvaler function. Placed here to limit its scope and local variables as narrowly as possible (hence the use of arguments[0])
    function (/* oData, i, oMetaData */) {
        //# Traverse the .inject'ions, setting each as a local var as we go
        for (arguments[1] in arguments[2].inject) {
            if (arguments[2].inject.hasOwnProperty(arguments[1])) {
                eval("var " + arguments[1] + "=arguments[2].inject[arguments[1]];");
            }
        }

        //# Setup the local .evaler under the passed oMetaData (aka arguments[2])
        arguments[2].evaler = function(/* sJS */) {
            return eval(arguments[0]);
        };

        //# Traverse the .js, processing each entry as we go
        for (arguments[1] = 0; arguments[1] < arguments[0].js.length; arguments[1]++) {
            try {
                arguments[0].results.push(arguments[2].context
                    ? arguments[2].evaler.call(arguments[2].context, arguments[0].js[arguments[1]])
                    : eval(arguments[0].js[arguments[1]])
                );
            } catch (e) {
                //# An error occured fnEval'ing the current i(ndex), so .push undefined into this i(ndex)'s entry in .results and log the .errors
                arguments[0].results.push(undefined);
                arguments[0].errors.push({ index: arguments[1], error: e, js: arguments[0].js[arguments[1]] });
            }
        }

        //# Return the modified arguments[0] to the caller
        //#     NOTE: As this is modified byref there is no need to actually return arguments[0]
        //return arguments[0];
    },
    //# fnUseStrictEvaler function. Placed here to limit its scope and local variables as narrowly as possible (hence the use of arguments[0])
    //#     NOTE: Since we cannot conditionally invoke strict mode (see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode#Invoking_strict_mode) we need 2 implementations for fnLocalEvaler and fnUseStrictEvaler
    function (/* oData, i, oMetaData */) {
        //# Traverse the .inject'ions, setting each as a local var as we go
        //#     NOTE: We do this outside of the "use strict" function below so we don't need to pollute the global context while still having persistent var's across eval'uations (which "use strict" doesn't allow)
        for (arguments[1] in arguments[2].inject) {
            if (arguments[2].inject.hasOwnProperty(arguments[1])) {
                eval("var " + arguments[1] + "=arguments[2].inject[arguments[1]];");
            }
        }

        //# Setup the internal function with "use strict" in place
        (function () {
            "use strict";

            //# Setup the local .evaler under the passed oMetaData (aka arguments[2])
            arguments[2].evaler = function (/* sJS */) {
                return eval(arguments[0]);
            };

            //# Traverse the .js, processing each entry as we go
            for (arguments[1] = 0; arguments[1] < arguments[0].js.length; arguments[1]++) {
                try {
                    arguments[0].results.push(arguments[2].context
                        ? arguments[2].evaler.call(arguments[2].context, arguments[0].js[arguments[1]])
                        : eval(arguments[0].js[arguments[1]])
                    );
                } catch (e) {
                    //# An error occured fnEval'ing the current i(ndex), so .push undefined into this i(ndex)'s entry in .results and log the .errors
                    arguments[0].results.push(undefined);
                    arguments[0].errors.push({ index: arguments[1], error: e, js: arguments[0].js[arguments[1]] });
                }
            }
        })(arguments[0], 0, arguments[2]);
        
        //# Return the modified arguments[0] to the caller
        //#     NOTE: As this is modified byref there is no need to actually return arguments[0]
        //return arguments[0];
    },
    //# fnSandboxEvalerFactory function.
    function (_window, $services, $factories) {
        "use strict";

        var a_fnPromises = [],
            bSendingString = false,
            bInit = false,
            iID = 0
        ;


        //# Returns a promise interface that uses .postMessage
        function promise(sType, oContext, bUnused, $sandboxWin) {
            //# If we we have not yet .init'd .postMessage under our own _window, do so now
            //#     NOTE: The looping logic is contained below allowing us to run multiple statements in order and without needing to track that all callbacks have been made
            //#     NOTE: Due to the nature of .$sandbox and the code below, the eval'uated code is exposed to only the "s" variable in the .global and .local functions
            if (!bInit) {
                bInit = true;

                //# Ensure the .addEventListener interface is setup/polyfilled then .addEventListener under our _window so we can recieve the .postMessage's
                _window.addEventListener = _window.addEventListener || function (e, f) { _window.attachEvent('on' + e, f); };
                _window.addEventListener("message",
                    function (oMessage) {
                        var oData;

                        //# Ensure bSendingString has been setup
                        //#     NOTE: IE8-9 do not allow the tranmission of objects via .postMessage, so we have to JSON.stringify/.parse in their case (or any other case where objects aren't sent), thankfully IE8-9 support JSON!
                        bSendingString = $services.is.str(oMessage.data);
                        
                        //# If the .origin is null and we have the .id within our .promises
                        //#     NOTE: Non-"allow-same-origin" sandboxed IFRAMEs return "null" rather than a valid .origin so we need to check the .source before accepting any .postMessage's
                        if (oMessage.origin === "null" && a_fnPromises[oData.id]) {
                            //# Collect our oData
                            oData = (bSendingString ? _window.JSON.parse(oMessage.data) : oMessage.data);

                            //# Fire the fnCallback stored in .promises (and protected by validating the .source), passing back the .r(esult) and the .arg(ument) then delete it from .promises
                            //#     NOTE: Filtering based on .source/$targetWin is done within the .promises functions
                            a_fnPromises[oData.id](
                                oMessage.source,
                                {
                                    results: oData.r,
                                    errors: oData.e,
                                    js: oData.js
                                },
                                oData.arg
                            );
                            delete a_fnPromises[oData.id];
                        }
                    },
                    false
                );

                //# .postMessage to ourselves so we can ensure bSendingString has been setup (targetDomain'ing * to ensure we can target ourselves)
                try {
                    _window.postMessage({}, "*");
                } catch (e) {
                    bSendingString = true;
                }
            }

            //# Return the promise to the caller
            return function (vJS, oInject, bReturnObject) {
                var bAsArray = $services.is.arr(vJS);

                return {
                    then: function (fnCallback, sArg) {
                        var oData = {
                            js: (bAsArray ? vJS : [vJS]),
                            id: iID++,
                            arg: sArg,
                            type: sType,
                            context: oContext,
                            inject: oInject
                        };

                        //# Set our fnCallback within .promises, filtering by $sandboxWin to ensure we trust the $source
                        a_fnPromises[iID] = function ($source, oResults, sArg) {
                            if ($source === $sandboxWin) {
                                //# If we are supposed to bReturnObject return our oReturnVal, else only return the .results (either bAsArray or just the first index)
                                fnCallback(
                                    (bReturnObject ? oResults : (bAsArray ? oResults.results : oResults.results[0])),
                                    sArg
                                );
                            }
                        };

                        //# .postMessage to our $sandboxWin (post-incrementating .id as we go and targetDomain'ing * so we reach our non-"allow-same-origin")
                        $sandboxWin.postMessage(
                            (bSendingString ? _window.JSON.stringify(oData) : oData),
                            "*"
                        );
                    }
                };
            };
        } //# promise


        //# Wires up a sandbox within the passed $iframe
        //#     NOTE: http://www.html5rocks.com/en/tutorials/security/sandboxed-iframes/#privilege-separation , https://developer.mozilla.org/en-US/docs/Web/API/window.postMessage
        function sandboxFactory($iframe) {
            var $sandboxWin = $iframe.contentWindow,
                //# Set bUsePostMessage and fnProcess based on the presence of allow-same-origin and .postMessage
                //#     NOTE: There is no need for a bFailover to add "allow-same-origin" if .postMessage isn't supported as both of these features are modern and either supported in pair or not
                bUsePostMessage = (_window.postMessage && ($iframe.getAttribute("sandbox") + "").indexOf("allow-same-origin") === -1),
                fnProcess = (bUsePostMessage ? promise : $factories.looper)
            ;

            //# Return the sandbox interface to the caller
            return {
                iframe: $iframe,
                window: $sandboxWin,
                secure: bUsePostMessage,

                //# Global/Isolated eval interface within the sandbox
                //#     NOTE: There is no point to pass a $window here as we use the passed $iframe's .contentWindow
                global: function (bFallback /*, $window*/) {
                    var sInterface = (bFallback ? "isolated" : "global");

                    return fnProcess(
                        (bUsePostMessage ? sInterface : $sandboxWin.$sandbox[sInterface]),
                        $sandboxWin
                        //, false
                    );
                },

                //# Local/Context eval interface within the sandbox
                local: function (oContext) {
                    var bContextPassed = (arguments.length === 1),
                        sInterface = (bContextPassed ? "context" : "local")
                    ;

                    return fnProcess(
                        (bUsePostMessage ? sInterface : $sandboxWin.$sandbox[sInterface]),
                        oContext || $sandboxWin,
                        bContextPassed,
                        $sandboxWin
                    );
                }
            };
        } //# sandboxFactory


        //# Return the sandbox factory to the caller
        return function(v1, v2, v3) {
            //# Determine how many arguments were passed and process accordingly
            switch (arguments.length) {
                //# If we were called with an $iframe
                case 1: {
                    sandboxFactory(v1);
                    break;
                }
                //# If we were called with a sSandboxAttr, sURL and optional $domTarget
                case 2:
                case 3: {
                    sandboxFactory($factories.iframe(v1, v2, v3));
                    break;
                }
            }
        }; //# return
    }
);


/*
http://blog.stackoverflow.com/2014/09/introducing-runnable-javascript-css-and-html-code-snippets/


 http://www.html5rocks.com/en/tutorials/security/sandboxed-iframes/

 http://stackoverflow.com/questions/4536237/putting-javascript-into-css/27751891#27751891
 http://stackoverflow.com/questions/476276/using-javascript-in-css/27751954#27751954
 http://stackoverflow.com/questions/7247202/how-to-use-variable-in-css?lq=1
 http://stackoverflow.com/questions/47487/create-a-variable-in-css-file-for-use-within-that-css-file


//# SCRIPT tag versus eval - http://stackoverflow.com/questions/8380204/is-there-a-performance-gain-in-including-script-tags-as-opposed-to-using-eval
//# 
//# http://www.nczonline.net/blog/2009/07/28/the-best-way-to-load-external-javascript/
//# http://stackoverflow.com/questions/8946715/lazy-loading-javascript-and-inline-javascript
//# http://www.html5rocks.com/en/tutorials/speed/script-loading/
//# https://github.com/jquery/jquery/blob/1.3.2/src/ajax.js#L264 but no longer in https://github.com/jquery/jquery/blob/1.x-master/src/ajax.js
function loadScript(sUrl, fnCallback) {
    var $script = document.createElement("script"),
        bLoaded = false
    ;

    //# Setup the $script tag
    $script.type = "text/javascript";
    $script.onload = $script.onreadystatechange = function () { 
        //# In order to support IE10- and Opera, test .readyState (which will be `undefined` in other environments), see: http://msdn.microsoft.com/en-au/library/ie/ms534359%28v=vs.85%29.aspx
        switch ($script.readyState || null) {
            case null:
            case "loaded":
            case "complete": {
                delete $script.onreadystatechange;
                if (!bLoaded) { fnCallback(); }
                bLoaded = true
            }
        }
    };
    $script.src = sUrl;

    //# 
    document.getElementsByTagName("head")[0].appendChild(script);
    //? document.documentElement.insertBefore(script, document.documentElement.firstChild);
}
*/
