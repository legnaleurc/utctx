var context_menu = require('sdk/context-menu');
var request = require('sdk/request');
const {Cc, Ci} = require('chrome');


function Template (s) {
    if (typeof s === 'string') {
    } else if (s instanceof String) {
        s = s.toString();
    } else {
        return null;
    }
    var T = {
        '{{': '{',
        '}}': '}',
    };
    return function () {
        var args = Array.prototype.slice.call(arguments);
        var kwargs = args[args.length-1];

        return s.replace(/\{\{|\}\}|\{([^\}]+)\}/g, function (m, key) {
            if (T.hasOwnProperty(m)) {
                return T[m];
            }
            if (args.hasOwnProperty(key)) {
                return args[key];
            }
            if (kwargs.hasOwnProperty(key)) {
                return kwargs[key];
            }
            return m;
        });
    };
}


function Deferred () {
    var d = {};
    var p = new Promise(function (resolve, reject) {
        d.resolve = resolve;
        d.reject = reject;
    });
    d.promise = p;
    return d;
}


function uTorrent () {
    this._prefs = require('sdk/simple-prefs').prefs;
    this._token = null;
}

uTorrent.TOKEN_URL = Template('http://{username}:{password}@{host}:{port}/gui/token.html');
uTorrent.ADD_URL = Template('http://{host}:{port}/gui/?token={token}&action=add-url&download_dir=1&s={url}');

uTorrent.prototype.authenticate = function () {
    var deferred = Deferred();

    if (this._token) {
        deferred.resolve(this._token);
        return deferred.promise;
    }

    var self = this;
    var xhr = request.Request({
        url: uTorrent.TOKEN_URL({
            username: self._prefs.username,
            password: self._prefs.password,
            host: self._prefs.host,
            port: self._prefs.port,
        }),
        onComplete: function (response) {
            var parser = Cc["@mozilla.org/xmlextras/domparser;1"].createInstance(Ci.nsIDOMParser);
            var document = parser.parseFromString(response.text, "text/html");
            var token = document.querySelector('#token');
            self._token = token.textContent;
            deferred.resolve(self._token);
        },
    });
    xhr.get();
    return deferred.promise;
};

uTorrent.prototype.addTorrent = function (url) {
    var self = this;
    return this.authenticate().then(function (token) {
        var deferred = Deferred();

        var xhr = request.Request({
            url: uTorrent.ADD_URL({
                host: self._prefs.host,
                port: self._prefs.port,
                token: token,
                url: encodeURIComponent(url),
            }),
            onComplete: function (response) {
                deferred.resolve();
            },
            onTimeout: function (response) {
                deferred.reject();
            },
        });
        xhr.get();

        return deferred.promise;
    });
};


var ut = new uTorrent();
var menu_item = context_menu.Item({
    label: 'uTorrent Download',
    context: [
        context_menu.URLContext('http://sukebei.nyaa.se/*'),
        context_menu.SelectorContext('a[href]'),
    ],
    contentScript: 'self.on("click", function (node, data) {self.postMessage(node.href);});',
    onMessage: function (message) {
        ut.addTorrent(message).then(function () {
            var promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
            promptService.alert(null, 'uTorrent Download', 'ok');
        });
    },
});
