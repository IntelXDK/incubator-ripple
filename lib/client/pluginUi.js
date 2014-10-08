// Copyright Intel Corporation 2014.  All Rights Reserved.
/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */

// This module is responsible for bringing in the emulator Ui contributions from plugins.
// We find the plugin Ui contributions by enumerating the www/plugins directory in the program under test.
// Files that appear below src/ripple/emulator/ui are considered to be dynamically added UI elements.
// Each UI element must have a JavaScript file and/or a like-named directory, e.g. something and/or
// something.js.  The html file in the directory determines whether the UI element is a
// dialog, panel, or overlay UI, and must named exactly overlay.html, panel.html, or dialog.html.
// An accompanying CSS file is also permitted, which is always called overlay.css.
// It is also possible to have other files, e.g. an images folder, but they are ignored here.
//
// When a Ui element is found, the corresponding JavaScript file must be added to the program by appending
// a <script> tab to the emulator document's body.  The CSS assets must be brought in as a <link> tag,
// which is appended to the emulator document's <head>.
//
// This just leaves the HTML assets to deal with.
// Panel.html files are added to the <div> whose id is "panel-views", and similarly for the others.
// Note that it is necessary to wait for these HTML files to load before proceeding, because
// otherwise you will get transient errors during UI initialization (looks for IDs before they exist).


var pluginExtensions = ripple('pluginExtensions');

var uiPluginModules;

function createNewXHR(url) {
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    return req;
}

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

var _self = {

    // Enumerate and incorporate the plugin UI components discovered earlier by pluginExtensions.js.
    // After we know what files are needed, we incorporate them into the DOM
    // by the following steps, which must be done in the following order:
    //
    // 1) Create a <link> tag for each overlay.css file.  For example:
    // <link href="plugins/org.apache.cordova.geolocation/src/ripple/emulator/ui/geoView/overlay.css"
    //   type="text/css" rel="stylesheet" />
    //
    // 2) Read and add the HTML contributions for the plugins into the appropriate section of the document.
    // For example, we would add the contents of
    // plugins/org.apache.cordova.geolocation/src/ripple/emulator/ui/geoView/panel.html
    // to the panel-views section.  Files named overview.html would be appended to the overlay-views container,
    // and files named dialog.html would be appended to the dialog-views container.
    // Note that we must read the contents of this HTML with an XHR and parse it ourselves.
    // There is no construct like <script> or <link> that adds HTML content to the current document.
    // The closest thing we have is <iframe>, but this creates a separate document.
    //
    // 3) For each plain file in the emulator/ui folder, construct a script tag
    // that includes this file into the emulator document.  For example:
    // <script src="/ripple/uiextensions/plugins/org.apache.cordova.geolocation/src/ripple/emulator/ui/geoView.js"
    //   type="text/javascript"></script>
    //
    // This defines an object that can be referred to as ripple('ui/plugins/geoView').
    //
    // After this is done, we need to update our bookkeeping to indicate that
    // the relevant panels, dialogs, and overlay views are added to the current
    // configuration, so they will be picked up by the natural ui initialization.
    //
    // Note that we must wait until all this new HTML5 is fully loaded
    // before we can pass the baton to the next step.

    initialize: function (prev,baton) {
        var pluginUiExtensions,
            pluginUiExtensionsLen,
            pluginRequest,
            extensionDirs,
            extensionJs,
            extensionHtml,
            extensionCss,
            extensionDirRequest,
            extensionDirRequestsToReceive, 
            pluginHtmlRequest,
            requestsToReceive,
            filesToLoad,
            i;

        function loadCounter() {
            filesToLoad -= 1;
            if (filesToLoad === 0) baton.pass();
        }
        function cssLoadCounter() {
            loadCounter();
        }
        function jsLoadCounter() {
            loadCounter();
        }
        function htmlLoadCounter() {
            loadCounter();
        }

        function loadStylesheet(src) {
            var head, linkElement;
            try {
                head = document.getElementsByTagName('head')[0];
                linkElement = document.createElement('link');
                linkElement.setAttribute("href", src);
                linkElement.setAttribute("type", "text/css");
                linkElement.setAttribute("rel", "stylesheet");
                linkElement.onload = cssLoadCounter;
                head.appendChild(linkElement);
            } catch (e) {
                console.log("Error attempting to load overlay.css file from " + src);
                console.log("Error: " + e.toString());
                cssLoadCounter(); // Done with this CSS file
            }
        }

        baton.take();

        // Get the array of UI extensions we found when we initialized pluginExtensions.
        pluginUiExtensions = pluginExtensions.getUiPlugins();
        pluginUiExtensionsLen = pluginUiExtensions.length;

        // If there are no UI extensions then we're done.
        if (pluginUiExtensionsLen === 0) {
            uiPluginModules = [];
            baton.pass();
            return;
        }

        // The pluginUiExtensions array consists of the names of the "ui" folders below
        // the various plugins that contribute UI.  We need to enumerate the contents of
        // these directories and then the contents of the subdirectories therein.
        // For example, starting from plugins/org.apache.cordova.geolocation/src/emulator/ui,
        // we enumerate its contents and find "geoView" and "geoView.js".  We enumerate the
        // contents of plugins/org.apache.cordova.geolocation/src/emulator/ui/geoView,
        // and we find overlay.css and panel.html.

        var extensionDirHelper = function(requestIndex) {
            return function() {
                var files, filesLen, i, extensionJsLen, extensionHtmlLen, extensionCssLen, scriptElement;

                var htmlHelper = function(requestIndex) {
                    return function() {
                        var container;
                        if (pluginHtmlRequest[requestIndex].readyState !== 4) return; // request isn't done yet

                        if (pluginHtmlRequest[requestIndex].status !== 200) { 
                            htmlLoadCounter();
                            return; // done with this file
                        }

                        // We have the HTML for a <div> in hand.
                        // Choose the right element to add it to based on the original filename
                        if (endsWith(extensionHtml[requestIndex], 'panel.html')) {
                            container = $('#panel-views');
                        } else if (endsWith(extensionHtml[requestIndex], 'overlay.html')) {
                            container = $('#overlay-views');
                        } else if (endsWith(extensionHtml[requestIndex], 'dialog.html')) {
                            container = $('#dialog-views');
                        } else {
                            // ?? Have something but don't know where to put it.  Fail.
                            console.log("Unknown UI extension html file: " + extensionHtml[requestIndex]);
                            htmlLoadCounter();
                            return;
                        }

                        try {
                            container.unbind().bind('DOMSubtreeModified', htmlLoadCounter);
                            container.append(pluginHtmlRequest[requestIndex].responseText);
                        } catch(e) {
                            htmlLoadCounter();
                            console.log("Error parsing and appending emulator UI HTML");
                            console.log("HTML was obtained from " + extensionHtml[requestIndex]);
                            console.log("Error: " + e.toString());
                            console.log("Document:\n");
                            console.log(pluginHtmlRequest[requestIndex].responseText);
                        }
                    };
                };

                if (extensionDirRequest[requestIndex].readyState !== 4) return; // request isn't done yet

                if (extensionDirRequest[requestIndex].status === 200) { 
                    files = extensionDirRequest[requestIndex].responseText.split('/');
                } else {
                    files = [];
                }
                filesLen = files.length; 
                
                // The files array should consist of one .html file and possibly an overlay.css file
                // and other files, e.g. images that we can ignore.

                // We generate two arrays: extensionCss and extensionHtml.
                for (i = 0; i < filesLen; i += 1) {
                    if (endsWith(files[i], '.css')) {
                        extensionCss.push(extensionDirs[requestIndex] + '/' + files[i]);
                    } else if (endsWith(files[i], '.html')) {
                        extensionHtml.push(extensionDirs[requestIndex] + '/' + files[i]);
                    }
                }

                extensionDirRequestsToReceive -= 1;
                if (extensionDirRequestsToReceive === 0) {

                    // Now we have the data from all the ui subfolders.
                    // This means we have identified all the files to be processed.

                    extensionJsLen = extensionJs.length;
                    extensionHtmlLen = extensionHtml.length;
                    extensionCssLen = extensionCss.length;
                    filesToLoad = extensionCssLen + extensionJsLen + extensionHtmlLen;

                    // Step 1: load the CSS
                    // Note that the CSS files are loaded relative via the normal source path
                    // route, which maps to the project root in the prepare/ripple/www folder.
                    // To compensate for this, we strip off that part of the path.
                    for (i = 0; i < extensionCssLen; i += 1) {
                        loadStylesheet(extensionCss[i].replace(/platforms\/ripple\/www\//, ''));
                    }

                    // Step 2: load the HTML
                    // Note that HTML files are loaded relative via the normal source path
                    // route, which maps to the project root in the prepare/ripple/www folder.
                    // To compensate for this, we strip off that part of the path.
                    pluginHtmlRequest = [];
                    for (i = 0; i < extensionHtmlLen; i += 1) {
                        pluginHtmlRequest[i] = createNewXHR(extensionHtml[i].replace(/platforms\/ripple\/www\//, ''));
                        pluginHtmlRequest[i].onreadystatechange = htmlHelper(i);
                        pluginHtmlRequest[i].send();
                    }

                    // Step 3: load the JavaScript
                    var body = document.getElementsByTagName('body')[0];
                    for (i = 0; i < extensionJsLen; i += 1) {
                        scriptElement = document.createElement('script');
                        scriptElement.src = 'ripple/uiextensions/' + extensionJs[i];
                        scriptElement.setAttribute('type', 'text/javascript');
                        scriptElement.onload = jsLoadCounter;
                        body.appendChild(scriptElement);
                        uiPluginModules.push(extensionJs[i].replace(/.*\//, '').replace(/\.js/, ''));
                    }
                }
            }; // function returned from helper function
        };

        var pluginRequestHelper = function(requestIndex) {
            return function() {
                var files, filesLen, i, extensionDirsLen;

                if (pluginRequest[requestIndex].readyState !== 4) return; // request isn't done yet

                if (pluginRequest[requestIndex].status === 200) { 
                    files = pluginRequest[requestIndex].responseText.split('/');
                    filesLen = files.length; 
                }
                
                // The files array should consist of names of .js files and
                // names of directories.  Usually they are paired, but
                // it is possible to have one without the other.

                // We generate two arrays: extensionJs and extensionDirs.
                for (i = 0; i < filesLen; i += 1) {
                    if (endsWith(files[i], '.js')) {
                        extensionJs.push(pluginUiExtensions[requestIndex] + '/' + files[i]);
                    } else {
                        extensionDirs.push(pluginUiExtensions[requestIndex] + '/' + files[i]);
                    }
                }

                requestsToReceive -= 1;
                if (requestsToReceive === 0) {

                    // Now we have the data from all the ui folders.
                    // We need to enumerate the contents of extensionDirs.
                    // This is basically the same thing all over again.

                    extensionDirsLen = extensionDirs.length;
                    extensionHtml = [];
                    extensionCss = [];
                    extensionDirRequest = [];
                    extensionDirRequestsToReceive = extensionDirsLen;
                    for (i = 0; i < extensionDirsLen; i += 1) {
                        extensionDirRequest[i] = createNewXHR('/ripple/directory/' + extensionDirs[i]);
                        extensionDirRequest[i].onreadystatechange = extensionDirHelper(i);
                        extensionDirRequest[i].send();
                    }
                }
            }; // function returned from helper function
        }; // helper function

        uiPluginModules = [];
        pluginRequest = [];
        requestsToReceive = pluginUiExtensionsLen;
        extensionJs = [];
        extensionDirs = [];

        for (i = 0; i < pluginUiExtensionsLen; i += 1) {
            pluginRequest[i] = createNewXHR('/ripple/directory/' + pluginUiExtensions[i]);
            pluginRequest[i].onreadystatechange = pluginRequestHelper(i);
            pluginRequest[i].send();
        }
    },

    getUiPluginModules: function () {
        return uiPluginModules;
    } 

};

module.exports = _self;
