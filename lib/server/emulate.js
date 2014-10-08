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
var proxy = require('./proxy'),
    server = require('./index'),
    colors = require('colors'),
    express = require('express'),
    fs = require('fs'),
    cordovaProject = require('./emulate/cordovaProject'),
    hosted = require('./emulate/hosted'),
    static = require('./emulate/static');

colors.mode = "console";

module.exports = {
    start: function (options) {
        var app = server.start(options);

        if (!options.path) { options.path = [process.cwd()]; }

        console.log("INFO:".green + " options.path = " +options.path);
        if (!options.route) {
            options.route = "/ripple";
        } else if (!options.route.match(/^\//)) {
            options.route = "/" + options.route;
        }

        app = proxy.start({route: options.route}, app);

        // TODO does not work with custom route (since ripple does not dynamically know custom ones, yet, if set)
        app.post("/ripple/user-agent", function (req, res/*, next*/) {
            res.send(200);

            options.userAgent = unescape(req.body.userAgent);

            if (options.userAgent) {
                console.log("INFO:".green + ' Set Device User Agent (String): "' + options.userAgent + '"');
            } else {
                console.log("INFO:".green + ' Using Browser User Agent (String)');
            }
        });

        app.use("/ripple/directory", function(req, res/*,next*/) {
            console.log("INFO:".green + ' Got request for directory contents of ' + req.path);
            var dirpath = options.path + req.path;
            console.log("INFO:".green + ' reading contents of ' + dirpath);
            fs.stat(dirpath, function(err, stats) {
                if ((!err) && stats.isDirectory()) {
                    fs.readdir(dirpath, function(err, files) {
                        // Having verified that the path is an existing directory, we should be able to read its contents
                        if (err) {
                            console.log('error reading directory: ' + err.toString());
                            res.status(500).send('');
                        } else {
                            var result = files.join('/');
                            console.log('sending directory contents "' + result + '"');
                            res.send(result);
                        }
                    });
                } else {
                    // An error in stat means the user requested an invalid path
                    // Treat like a non-existent directory
                    res.status(200).send('');
                }
            });
        });

        app.use("/ripple/extensions", function(req, res/*,next*/) {
            console.log("INFO:".green + ' Got request for extension ' + req.path);
            var extpath = options.path + req.path;
            var extModule = extpath.replace(/.*\//,'').replace(/\.js$/,'');
            console.log("INFO:".green + ' reading ' + extpath + ' as module ' + extModule);
            fs.exists(extpath, function(exists) {
                if (exists) {
                    fs.readFile(extpath, function(err, data) {
                        if (err) {
                            console.log('error reading file: ' + err.toString());
                            res.status(404).send('');
                        } else {
                            console.log('sending module ' + extModule);
                            res.send('ripple.define("' + extModule + '", function (ripple, exports, module) {' + data.toString() + '});');
                        }
                    });
                } else {
                    console.log("INFO:".red + ' file ' + extpath + ' does not exist');
                    res.status(404).send('');
                }
            });
        });

        app.use("/ripple/uiextensions", function(req, res/*,next*/) {
            console.log("INFO:".green + ' Got request for uiextension ' + req.path);
            var extpath = options.path + req.path;
            var extModule = extpath.replace(/.*\//,'').replace(/\.js$/,'');
            console.log("INFO:".green + ' reading ' + extpath + ' as module ' + extModule);
            fs.exists(extpath, function(exists) {
                if (exists) {
                    fs.readFile(extpath, function(err, data) {
                        if (err) {
                            console.log('error reading file: ' + err.toString());
                            res.status(404).send('');
                        } else {
                            console.log('sending module ' + extModule);
                            res.send('ripple.define("ui/plugins/' + extModule + '", function (ripple, exports, module) {' + data.toString() + '});');
                        }
                    });
                } else {
                    console.log("INFO:".red + ' file does not exist');
                    res.status(404).send('');
                }
            });
        });

        // TODO: How to make into a dynamic route (using options.route)? (set at build time right now)
        app.use("/ripple/assets", express.static(__dirname + "/../../pkg/hosted"));
        app.use(cordovaProject.inject(options));
        app.use(hosted.inject(options));

        if (!options.remote) {
            app.use("/", static.inject(options));
        }

// TODO: This should just talk about how to enable ripple via query params
//        app.use(options.route + "/enable/", express.static(__dirname + "/../../assets/server"));
//
//        console.log();
//        console.log("INFO:".green + " Load the URL below (in Chrome) to auto-enable Ripple.");
//        console.log("      " + ("http://localhost:" + app._port + options.route + "/enable/").cyan);
//        console.log();

        return app;
    }
};
