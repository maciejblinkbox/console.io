/**
 * Created with IntelliJ IDEA.
 * User: nisheeth
 * Date: 19/05/13
 * Time: 14:24
 * To change this template use File | Settings | File Templates.
 */

window.SocketIO = (function () {

    "use strict";

    var Socket = {
        io: null,
        name: null,
        guid: null,
        config: null,
        forceReconnection: true,
        forceReconnectInterval: 5000,
        setInterval: null,
        subscribed: false,
        connectionMode: null,
        pending: [],

        init: function init(config) {
            this.config = config;
            this.io = window.io.connect(config.url, { secure: (config.secure == 'true') });

            // Fix for old Opera and Maple browsers
            (function overrideJsonPolling(io) {
                var original = io.Transport["jsonp-polling"].prototype.post;
                io.Transport["jsonp-polling"].prototype.post = function (data) {
                    var scope = this;
                    original.call(this, data);
                    setTimeout(function () {
                        scope.socket.setBuffer(false);
                    }, 250);
                };
            }(window.io));

            // set events
            this.io.on('connect', this.onConnect);
            this.io.on('connecting', this.onConnecting);
            this.io.on('reconnect', this.onReconnect);
            this.io.on('reconnecting', this.onReconnecting);
            this.io.on('disconnect', this.onDisconnect);
            this.io.on('connect_failed', this.onConnectFailed);
            this.io.on('reconnect_failed', this.onReconnectFailed);
            this.io.on('error', this.onError);

            this.io.on('device:ready', this.onReady);
            this.io.on('device:online', this.onOnline);
            this.io.on('device:offline', this.onOffline);
            this.io.on('device:command', this.onCommand);
            this.io.on('device:fileList', this.onFileList);
            this.io.on('device:htmlContent', this.onHTMLContent);
            this.io.on('device:fileSource', this.onFileSource);
            this.io.on('device:status', this.onStatus);
            this.io.on('device:reload', this.onReload);
        },

        emit: function emit(name, data) {
            if (this.io && this.io.socket.connected) {
                //data.name = this.name;
                this.io.emit('device:' + name, data);
            } else {
                this.pending.push({ name: name, data: data });
            }
        },

        forceReconnect: function forceReconnect() {
            if (this.forceReconnection && !this.setInterval) {
                this.setInterval = window.setInterval(function () {
                    if (!Socket.io.socket.connected || (Socket.io.socket.connected && !Socket.subscribed)) {
                        Socket.io.socket.disconnect();
                        Socket.io.socket.reconnect();
                    }
                }, this.forceReconnectInterval);
            }
        },

        onConnect: function onConnect() {
            console.log('Connected to the Server');

            var navigator = window.navigator;
            Socket.emit('setUp', {
                userAgent: navigator.userAgent,
                appVersion: navigator.appVersion,
                vendor: navigator.vendor,
                platform: navigator.platform,
                opera: !!window.opera,
                params: Socket.config
            });
        },

        onConnecting: function onConnecting(mode) {
            Socket.connectionMode = mode;
            console.log('Connecting to the Server');
        },

        onReconnect: function onReconnect(mode, attempts) {
            Socket.connectionMode = mode;
            console.log('Reconnected to the Server after' + attempts + ' attempts.');
        },

        onReconnecting: function onReconnecting() {
            console.log('Reconnecting to the Server');
        },

        onDisconnect: function onDisconnect() {
            console.log('Disconnected from the Server');
        },

        onConnectFailed: function onConnectFailed() {
            console.warn('Failed to connect to the Server');
        },

        onReconnectFailed: function onReconnectFailed() {
            console.warn('Failed to reconnect to the Server');
        },

        onError: function onError() {
            console.warn('Socket Error');
        },

        onReady: function onReady(data) {
            Socket.name = data.name;
            Socket.guid = data.guid;

            showName(data.name + '|' + data.guid);
            console.log('Ready', Socket.name);

            Socket.forceReconnect();
        },

        onOnline: function onOnline(data) {
            if (!Socket.guid) {
                Socket.name = data.name;
                Socket.guid = data.guid;
                showName(data.name + '|' + data.guid);
            }

            if (data.guid === Socket.guid) {
                console.log('Online', Socket.name);
                Socket.subscribed = true;
                ConsoleIO.forEach(Socket.pending, function (item) {
                    Socket.emit(item.name, item.data);
                });
                Socket.pending = [];
            }
        },

        onOffline: function onOffline(data) {
            if (!Socket.guid) {
                Socket.name = data.name;
                Socket.guid = data.guid;
                showName(data.name + '|' + data.guid);
            }

            if (data.guid === Socket.guid) {
                console.log('Offline', Socket.name);
                Socket.subscribed = false;
            }
        },

        onStatus: function onStatus(data) {
            Socket.emit('status', {
                connection: {
                    mode: Socket.connectionMode
                },
                document: {
                    cookie: document.cookie
                },
                navigator: getBrowserInfo(window.navigator),
                location: getBrowserInfo(window.location),
                screen: getBrowserInfo(window.screen)
            });
        },

        onFileSource: function onFileSource(data) {
            var xmlhttp = getXMLHttp();
            if (xmlhttp) {
                xmlhttp.open("GET", data.url, true);
                xmlhttp.onreadystatechange = function () {
                    if (xmlhttp.readyState === 4) {
                        var content;
                        if (xmlhttp.status === 200) {
                            content = xmlhttp.responseText;
                        } else {
                            content = xmlhttp.statusText;
                        }

                        Socket.emit('source', { url: data.url, content: content });
                    }
                };
                //xmlhttp.onload  = function (e) { ConsoleIO.native.log('onload',e); };
                xmlhttp.onerror = function (e) {
                    Socket.emit('source', { url: data.url, content: 'XMLHttpRequest Error: Possibally Access-Control-Allow-Origin security issue.' });
                };
                xmlhttp.send(null);
            } else {
                Socket.emit('source', { url: data.url, content: 'XMLHttpRequest request not supported by the browser.' });
            }
        },

        onReload: function onReload() {
            setTimeout((function (url) {
                return function () {
                    window.location.assign(url);
                };
            }(location.href)), 1000);
        },

        onHTMLContent: function onHTMLContent() {
            Socket.emit('content', { content: document.documentElement.innerHTML });
        },

        onFileList: function onFileList() {
            var scripts = [],
                styles = [],
                origin = (location.origin || location.href.replace(location.pathname, ""));

            ConsoleIO.forEach(ConsoleIO.toArray(document.scripts), function (script) {
                if (script.src) {
                    scripts.push(script.src.replace(origin, ""));
                }
            });

            if (scripts.length > 0) {
                Socket.emit('files', {
                    type: 'javascript',
                    files: scripts
                });
            }

            ConsoleIO.forEach(ConsoleIO.toArray(document.getElementsByTagName('link')), function (style) {
                if (style.href) {
                    styles.push(style.href.replace(origin, ""));
                }
            });

            if (styles.length > 0) {
                Socket.emit('files', {
                    type: 'style',
                    files: styles
                });
            }
        },

        onCommand: function onCommand(cmd) {
            var evalFun, result;
            try {
                //Function first argument is Deprecated
                evalFun = new Function([], "return " + cmd);
                result = evalFun();
                if (result) {
                    console.command(result);
                }
            } catch (e) {
                if (evalFun && evalFun.toString()) {
                    console.error(e, evalFun.toString());
                } else {
                    console.error(e);
                }
            }
        }
    };

    function getBrowserInfo(obj) {
        var returnObj = { More: [] },
            dataTypes = [
                '[object Arguments]', '[object Array]',
                '[object String]', '[object Number]', '[object Boolean]',
                '[object Error]', '[object ErrorEvent]',
                '[object Object]'
            ];

        ConsoleIO.forEachProperty(obj, function (value, property) {
            if (dataTypes.indexOf(ConsoleIO.getObjectType(value)) > -1) {
                returnObj[property] = ConsoleIO.Stringify.parse(value);
            } else {
                returnObj.More.push(property);
            }
        });

        return returnObj;
    }

    function getXMLHttp() {
        var xhr;
        if (window.XMLHttpRequest) {
            xhr = new XMLHttpRequest();
            xhr.withCredentials = false;
        } else if (window.XDomainRequest) {
            xhr = new XDomainRequest();
        } else if (window.ActiveXObject) {
            xhr = new ActiveXObject("Microsoft.XMLHTTP");
        }
        return xhr;
    }

    function showName(content) {
        var className = "console-content",
            styleId = "device-style";

        if (!document.getElementById(styleId)) {
            var css = "." + className + "::after { content: '" + content +
                    "'; position: fixed; top: 0px; left: 0px; padding: 2px 8px; " +
                    "font-size: 12px; font-weight: bold; color: rgb(111, 114, 117); " +
                    "background-color: rgba(192, 192, 192, 0.5); border: 1px solid rgb(111, 114, 117); " +
                    "font-family: Monaco,Menlo,Consolas,'Courier New',monospace; };",
                head = document.getElementsByTagName('head')[0],
                style = document.createElement('style');

            style.type = 'text/css';
            style.id = styleId;

            if (style.styleSheet) {
                style.styleSheet.cssText = css;
            } else {
                style.appendChild(document.createTextNode(css));
            }

            head.appendChild(style);
        }

        (document.body.firstElementChild || document.body.firstChild).setAttribute("class", className);
    }

    return Socket;
}());