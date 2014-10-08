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

// This module is responsible for bringing in the emulator contributions from plugins.
// We find the plugin contributions by enumerating the www/plugins directory in the program under test.
// Files that appear below www/plugins/<pluginid>/src/ripple/emulator are considered part of the emulator.
// Files in that directory behave as if they were in the ripple client/lib source directory.
// Files that appear below www/plugins/<pluginid>/src/ripple/emulator/ui are considered to be UI elements
// to be added dynamically.  Each UI element must have a JavaScript file and a like-named directory,
// e.g. something and something.js.  The contents of the directory determine whether the UI element is a
// dialog, panel, or overlay UI.  They are distinguished by the name of the HTML file, which must be
// overlay.html, panel.html, or dialog.html. An accompanying CSS file is also permitted, which is
// always called overlay.css.
//
// Plain JavaScript files are brought in simply by constructing a <script> tag that refers to the file
// and appending it to the emualtor UI.  To facilitate this process, we invented a new route in the
// emulator server.  Normally files in the emulator source base are referenced as /ripple/assets".
// We can't do that here, because the files are relative to the program under test.
// However, we don't want to reference them directly as that would require us to have the plugin
// author include the "ripple.define" wrapper, and emulator code normally does not require this.
// So we use the new route, "/ripple/extensions/relpath", where relpath is interpreted as relative
// to the project root, typically the platform/ripple/www folder.
//
// For example, to bring in the file
// <PlatformsDirectory>/rippple/www/plugins/org.apache.cordova.geolocation/src/ripple/emulator/geo.js,
// we would create a <script> tag whose src= attribte was
// /ripple/extensions/plugins/org.apache.cordova.geolocation/src/ripple/emulator.geo.js
//
// UI elements are more complicated, because they must be dynamically integrated into the UI.
// This problem is handled in ui.js.

var _plugins = [];
var _extensionFiles = [];
var _pluginsRoot = 'plugins'; // 'platforms/ripple/www/plugins';
var _UiPlugins;

function createNewXHR(url) {
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    return req;
}

var _self = {
    initialize: function (prev,baton) {

        // Find the plugins folder and enumerate its contents
        // for each plain file in the plugin folder, construct a <script> tag and append to the emulator's body.
        // <script src="/ripple/extensions/org.apache.cordova.geolocation/src/ripple/emulator/geo.js" type="text/javascript"></script>

        var req;
        baton.take();
        _plugins = [];
        _extensionFiles = [];
        _UiPlugins = [];
        req = createNewXHR('/ripple/directory/' + _pluginsRoot);
        req.onreadystatechange = function () {
            var pluginRequest, pluginsLen, pluginRequestDir, requestsToReceive, i;

            if (req.readyState !== 4) return; // request isn't finished yet

            // We have the response, which should be a string of the form
            // "id1/id2/.../idn", but must ignore "ripple.json".
            if ((req.status === 200) && (req.responseText !== 'ripple.json') && (req.responseText !== '')) {

                _plugins = req.responseText.replace(/(\/ripple.json|ripple.json\/)/,'').split('/');

                // Iterate through the plugins and issue an XMLHttpRequest
                // for each one to discover what additional emulation
                // files are present in that plugin.  We use a helper
                // function to create a separate function to handle
                // the response to each request.

                var pluginRequestDirHelper = function(requestIndex) {

                    return function() {
                        var files, filesLen, i, scriptElement, scriptsToLoad, extensionFilesLen, responseWithoutUi, scriptModules;

                        var scriptLoadHelper = function(requestIndex) {
                            return function() {
                                var obj;
                                // Call the initialization function, if it exists
                                try {
                                    obj = ripple(scriptModules[requestIndex]);
                                    if (obj && obj.initialize) {
                                        console.log('Initialized plugin extension ' + scriptModules[requestIndex] +
                                            ' from ' + _extensionFiles[requestIndex]);
                                        obj.initialize();
                                    }
                                } catch (e) {
                                    console.log('Error initializing plugin extension ' + scriptModules[requestIndex] +
                                       ' from ' + _extensionFiles[requestIndex]);
                                    console.log('Error was ', e);
                                }
                                scriptsToLoad -= 1;
                                if (scriptsToLoad === 0) {
                                    // When the last script is loaded we can pass the baton
                                    baton.pass();
                                }
                            };
                        };

                        if (pluginRequest[requestIndex].readyState !== 4) return; // request isn't done yet

                        // response string may contain "ui" meaning there is extension UI
                        if ((pluginRequest[requestIndex].status === 200)  &&
                            (pluginRequest[requestIndex].responseText !== '')) {

                            if (pluginRequest[requestIndex].responseText === 'ui') {
                                _UiPlugins.push(pluginRequestDir[requestIndex] + '/ui'); // has UI and nothing else
                            } else {
                                responseWithoutUi = pluginRequest[requestIndex].responseText.replace(/(\/ui|ui\/)/,'');
                                if (responseWithoutUi !== pluginRequest[requestIndex].responseText) {
                                    _UiPlugins.push(pluginRequestDir[requestIndex] + '/ui');
                                }

                                files = responseWithoutUi.split('/');
                                filesLen = files.length;
                                for (i = 0; i < filesLen; i += 1) {
                                    _extensionFiles.push(pluginRequestDir[requestIndex] + '/' + files[i]);
                                }
                            }

                        }

                        // Having combined the contribution of that plugin request
                        // to the _extensionFiles array, see if this is the last
                        // pluginRequest to complete.  If so, then start the process
                        // of adding the extension files to the document.
                        // Note: the order of loading of <script> tags is indeterminate,
                        // but the main point is that all these files get loaded before
                        // any of the script files that support UI for the plugins.
                        // After the script is loaded, we call the initialize function
                        // of that newly registered ripple object (if it exists).

                        requestsToReceive -= 1;
                        if (requestsToReceive === 0) {
                            // Got the data from the last plugin: time to create script tags
                            // for all the files we need from all the plugins
                            var body = document.getElementsByTagName('body')[0];
                            scriptsToLoad = extensionFilesLen = _extensionFiles.length;
                            if (scriptsToLoad === 0) {
                                baton.pass();
                                return;
                            }
                            scriptModules = [];
                            for (i = 0; i < extensionFilesLen; i += 1) {
                                scriptElement = document.createElement('script');
                                scriptModules.push(_extensionFiles[i].replace(/.*\//, '').replace(/\.js/,''));
                                scriptElement.src = 'ripple/extensions/' + _extensionFiles[i];
                                scriptElement.setAttribute('type', 'text/javascript');
                                scriptElement.onload = scriptLoadHelper(i);
                                body.appendChild(scriptElement);
                            }
                        }
                    }; // function returned from pluginRequestDirHelper function
                }; // pluginRequestDirHelper function

                pluginRequest = [];
                pluginRequestDir = [];
                requestsToReceive = pluginsLen = _plugins.length;

                for (i = 0; i < pluginsLen; i += 1) {
                    pluginRequestDir[i] = _pluginsRoot + '/' + _plugins[i] + '/src/ripple/emulator';
                    pluginRequest[i] = createNewXHR('/ripple/directory/' + pluginRequestDir[i]);
                    pluginRequest[i].onreadystatechange = pluginRequestDirHelper(i);
                    pluginRequest[i].send();
                }

            } else {
                // GET failed or found no plugins: just pass the baton
                baton.pass();
            }
        };
        req.send();
    },

    getPlugins: function() {
        return _plugins;
    },

    getUiPlugins: function() {
        return _UiPlugins;
    }
};

module.exports = _self;
