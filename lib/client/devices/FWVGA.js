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
module.exports = {
    "group": "Generic Devices",

    "id": "FWVGA",
    "name": "Generic - FWVGA (480x854)",
    "osName": "Generic",
    "osVersion": "Generic",
    "manufacturer": "Generic",
    "model": "Generic",
    "uuid": "42",

    "screen": {
        "width": 480,
        "height": 854
    },
    "viewPort": {
        "portrait": {
            "width": 480,
            "height": 854,
            "paddingTop": 0,
            "paddingLeft": 0
        },
        "landscape": {
            "width": 854,
            "height": 480,
            "paddingTop": 0,
            "paddingLeft": 0
        }
    },

    "ppi": 96,
    "platforms": ["web", "cordova"],
};
