/*
evaler.js v0.5d http://opensourcetaekwondo.com/evaler/
(c) 2014-2015 Nick Campbell cjsssdev@gmail.com
License: MIT
*/
//# SCRIPT tag versus eval - http://stackoverflow.com/questions/8380204/is-there-a-performance-gain-in-including-script-tags-as-opposed-to-using-eval , http://jsperf.com/dynamic-script-tag-with-src-vs-xhr-eval-vs-xhr-inline-s/4
(function ($win, $doc, fnEvalerFactory, fnLocalEvaler, fnUseStrictEvaler, fnSandboxEvalerFactory) {
    "use strict";

    //# Setup the $services required by the evalers
    var $services = {
        is: {
            fn: function (f) {
                return (Object.prototype.toString.call(f) === '[object Function]');
            },
            obj: function (o) {
                return (o && o === Object(o) && !$services.is.fn(o));
            },
            arr: function (a) {
                return (Object.prototype.toString.call(a) === '[object Array]');
            }
        },
        newID: function (sPrefix) {
            var sRandom;
            sPrefix = sPrefix || cjsss;

            //# Do...while the sPrefix + sRandom exists as an ID in the document, try to find a unique ID returning the first we find
            do {
                sRandom = Math.floor(Math.random() * 1000);
            } while (document.getElementById(sPrefix + sRandom));
            return sPrefix + sRandom;
        }
    };

    //# Run the fnEvalerFactory, setting its result into window.evaler
    $win.evaler = fnEvalerFactory($win, $doc, $services, fnLocalEvaler, fnUseStrictEvaler, fnSandboxEvalerFactory);
})(
    window,
    document,
    function ($win, $doc, $services, fnLocalEvaler, fnUseStrictEvaler, fnSandboxEvalerFactory) {
        "use strict";

        var fnJSONParse,
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
                    oReturnVal = {
                        js: (bAsArray ? vJS : [vJS]),
                        results: [],
                        errors: []
                    }
                ;

                //# If we have a oContext and the passed oInject .is.obj
                if (oContext && $services.is.obj(oInject)) {
                    //# Traverse oInject, setting each .hasOwnProperty into the oContext (leaving oContext's current definition if there is one)
                    for (i in oInject) {
                        if (oInject.hasOwnProperty(i)) {
                            oContext[i] = oContext[i] || oInject[i];
                        }
                    }
                }

                //# Traverse the .js, .pushing each fnEval .results into our oReturnVal (optionally .call'ing bInContext if necessary as we go)
                for (i = 0; i < oReturnVal.js.length; i++) {
                    try {
                        oReturnVal.results.push(bInContext ? fnEval.call(oContext, oReturnVal.js[i]) : fnEval(oReturnVal.js[i]));
                    } catch (e) {
                        //# An error occured fnEval'ing the current i(ndex), so .push undefined into this i(ndex)'s entry in .results and log the .errors
                        oReturnVal.results.push(undefined);
                        oReturnVal.errors.push({ index: i, error: e });
                    }
                }

                //# If we are supposed to bReturnObject return our oReturnVal, else only return the .results (either bAsArray or just the first index)
                return (bReturnObject ? oReturnVal : (bAsArray ? oReturnVal.results : oReturnVal.results[0]));
            };
        } //# looperFactory


        //# Factory function that returns a looper function for the requested evaluation eMode, oContext and oConfig
        function evalerFactory(eMode, oContext, oConfig) {
            var fnEvaler,
                bContextPassed = (oContext !== undefined && oContext !== null)
            ;

            //# Default the oContext to $win if it wasn't passed
            oContext = (bContextPassed ? oContext : $win);

            //# Determine the eMode and process accordingly
            switch (eMode/*.substr(0, 1).toLowerCase()*/) {
                //# global
                case "g": {
                    //# If this is a request for the current $win
                    if (oContext === $win) {
                        //# Ensure the fnGlobalEvaler has been setup, then safely set it (or optionally fnLocalEvaler if we are to .f(allback)) into fnEvaler
                        getGlobalEvaler();
                        fnEvaler = (!fnGlobalEvaler && oConfig.f ? fnLocalEvaler : fnGlobalEvaler);

                        //# If we were able to collect an fnEvaler above, return the configured looper
                        if (fnEvaler) {
                            return looperFactory(fnEvaler, $win/*, false*/);
                        }
                    }
                        //# Else if the passed oContext has an .eval function
                    else if ($services.is.fn(oContext.eval)) {
                        //# Attempt to collect the foreign fnGlobalEvaler, then safely set it (or optionally the foreign fnLocalEvaler if we are to .f(allback)) into fnEvaler
                        fnEvaler = oContext.eval("function(){" + getGlobalEvaler(true) + "}()");
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
                    //# Ensure the passed oConfig .is.obj, then collect the .id
                    oConfig = ($services.is.obj(oConfig) ? oConfig : {});
                    oConfig.id = $services.newId("psandbox");

                    //# .insertAdjacentHTML IFRAME at the beginning of the .body (or .head)
                    //#     NOTE: In order to avoid polyfilling .outerHTML, we simply hard-code the IFRAME code below
                    ($doc.body || $doc.head || $doc.getElementsByTagName("head")[0])
                        .insertAdjacentHTML('afterbegin', '<iframe id="' + oConfig.id + '" style="display:none;" sandbox="allow-scripts allow-same-origin"></iframe>')
                    ;

                    //# Grab the .iframe and .window (via the IFRAME's .id), then recurse to collect the isolated .window's fnEvaler (signaling to .f(allback) and that we are .r(ecursing))
                    oConfig.iframe = $doc.getElementById(oConfig.id);
                    oConfig.window = oConfig.iframe.contentWindow;
                    fnEvaler = evalerFactory("g", oConfig.window, { f: 1, r: 1 });

                    //# Return the configured looper, defaulting oContext to the $sandboxWin if !bContextPassed
                    return looperFactory(fnEvaler, oContext || oConfig.window, bContextPassed);
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
        if ($win.JSON && $win.JSON.parse) {
            fnJSONParse = $win.JSON.parse;
        }
            //# Else if $jQuery's .parseJSON is available, set fnJSONParse to it
        else if ($win.jQuery && $win.jQuery.parseJSON) {
            fnJSONParse = $win.jQuery.parseJSON;
        }

        //# Configure and return our return value
        return {
            global: function (bFallback, $window) {
                return evalerFactory("g", $window || $win, { f: bFallback });
            },
            local: function (oContext) {
                return evalerFactory("l", oContext /*, {}*/);
            },
            useStrict: function (oContext) {
                return evalerFactory("u", oContext /*, {}*/);
            },
            isolated: function (oContext, oReturnedByRef) {
                return evalerFactory("i", oContext, oReturnedByRef);
            },
            json: (!fnJSONParse ? undefined : function () {
                return evalerFactory("j" /*, undefined, {}*/);
            }),
            sandbox: (!fnSandboxEvalerFactory ? undefined : fnSandboxEvalerFactory($win, $doc, $services, looperFactory))
        };
    },
    function (/* sJS */) { //# fnLocalEvaler function. Placed here to limit its scope and local variables as narrowly as possible (hence the use of arguments[0] below)
        return eval(arguments[0]);
    },
    function (/* sJS */) { //# fnUseStrictEvaler function. Placed here to limit its scope and local variables as narrowly as possible (hence the use of arguments[0] below)
        "use strict";
        return eval(arguments[0]);
    },
    function ($win, $doc, $services, fnLooperFactory) { //# fnSandboxEvalerFactory function.
        "use strict";

        var a_fnPromises = [],
            bInit = false,
            iID = 0
        ;


        //# Returns a promise interface that uses .postMessage
        function promise(sType, oContext, bUnused, $sandboxWin) {
            //# If we we have not yet .init'd .postMessage under our own $win, do so now
            //#     NOTE: The looping logic is contained below allowing us to run multiple statements in order and without needing to track that all callbacks have been made
            //#     NOTE: Due to the nature of .$sandbox and the code below, the eval'uated code is exposed to only the "s" variable in the .global and .local functions
            if (!bInit) {
                bInit = true;

                //# Ensure the .addEventListener interface is setup/polyfilled then .addEventListener under our $win so we can recieve the .postMessage's
                $win.addEventListener = $win.addEventListener || function (e, f) { $win.attachEvent('on' + e, f); };
                $win.addEventListener("message",
                    function (oMessage) {
                        //# If the .origin is null and we have the .id within our .promises
                        //#     NOTE: Non-"allow-same-origin" sandboxed IFRAMEs return "null" rather than a valid .origin so we need to check the .source before accepting any .postMessage's
                        if (oMessage.origin === "null" && a_fnPromises[oMessage.data.id]) {
                            //# Fire the fnCallback stored in .promises (and protected by validating the .source), passing back the .r(esult) and the .arg(ument) then delete it from .promises
                            //#     NOTE: Filtering based on .source/$targetWin is done within the .promises functions
                            a_fnPromises[oMessage.data.id](
                                oMessage.source,
                                {
                                    results: oMessage.data.r,
                                    errors: oMessage.data.e,
                                    js: oMessage.data.js
                                },
                                oMessage.data.arg
                            );
                            delete a_fnPromises[oMessage.data.id];
                        }
                    },
                    false
                );
            }

            //# Return the promise to the caller
            return function (vJS, oInject, bReturnObject) {
                var bAsArray = $services.is.arr(vJS);

                return {
                    then: function (fnCallback, sArg) {
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

                        //# .postMessage to our $sandboxWin (post-incrementating .id as we go)
                        $sandboxWin.postMessage({
                            js: (bAsArray ? vJS : [vJS]),
                            id: iID++,
                            arg: sArg,
                            type: sType,
                            context: oContext,
                            inject: oInject
                        }, "*");
                    }
                };
            };
        } //# promise


        //# Return the sandbox factory to the caller (which creates a sandbox via an iFrame added to the DOM)
        //#     NOTE: http://www.html5rocks.com/en/tutorials/security/sandboxed-iframes/#privilege-separation , https://developer.mozilla.org/en-US/docs/Web/API/window.postMessage
        return function (sSandboxAttr) {
            var fnProcess, $sandboxWin, bPostMessage,
                oReturnVal = {
                    id: $services.newId("sandbox")
                }
            ;

            //# As long as the caller didn't request an IFRAME without a sandbox attribute, reset sSandboxAttr to an attribute definition
            sSandboxAttr = (sSandboxAttr === null
                ? ''
                : ' sandbox="' + (sSandboxAttr ? sSandboxAttr : "allow-scripts") + '"'
            );

            //# Set bPostMessage and fnProcess based on the presence of allow-same-origin and .postMessage
            bPostMessage = (sSandboxAttr.indexOf("allow-same-origin") === -1 && $win.postMessage);
            fnProcess = (bPostMessage ? promise : fnLooperFactory);

            //# .insertAdjacentHTML IFRAME at the beginning of the .body (or .head)
            //#     NOTE: In order to avoid polyfilling .outerHTML, we simply hard-code the IFRAME code below
            ($doc.body || $doc.head || $doc.getElementsByTagName("head")[0])
                .insertAdjacentHTML('afterbegin', '<iframe src="" id="' + oReturnVal.id + '" style="display:none;"' + sSandboxAttr + '></iframe>')
            ;

            //# Grab the .iframe and .window (via the IFRAME's .id) and set .isSecure
            oReturnVal.iframe = $doc.getElementById(oReturnVal.id);
            oReturnVal.window = $sandboxWin = oReturnVal.iframe.contentWindow;
            oReturnVal.isSecure = (fnProcess === promise);

            //#
            oReturnVal.global = function (bFallback /*, $window*/) { //# NOTE: There is no point to pass a $window here as we create our own each time
                var sInterface = (bFallback ? "isolated" : "global");

                return fnProcess(
                    (bPostMessage ? sInterface : $sandboxWin.$sandbox[sInterface]),
                    $sandboxWin
                    //, false
                );
            };
            oReturnVal.local = function (oContext) {
                var bContextPassed = (arguments.length === 1),
                    sInterface = (bContextPassed ? "context" : "local")
                ;

                return fnProcess(
                    (bPostMessage ? sInterface : $sandboxWin.$sandbox[sInterface]),
                    oContext || $sandboxWin,
                    bContextPassed,
                    $sandboxWin
                );
            };

            return oReturnVal;
        }; //# create
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
