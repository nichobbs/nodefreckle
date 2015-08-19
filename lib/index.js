var https = require("https");

module.exports = function() {
    function self(subdomain, token) {
        self.settings.subdomain = subdomain;
        self.settings.token = token;

        return self;
    }

    self.date = function(obj) {
        var year = obj.getFullYear(),
            month = obj.getMonth() + 1,
            day = obj.getDate()

            month = month < 10 ? '0' + month : month.toString()
            day = day < 10 ? '0' + day : day.toString()

            return [year, month, day].join('-');
    };

    self.settings = {
        host: "letsfreckle.com",
        path: "/v2/",
        apidomain: "api",
        subdomain: "",
        port: 443,
        token: "",
        authHeader: "X-FreckleToken"
    };

    var paramExp = /(:\b\w*\b)/gi;

    function api() {
        var args = Array.prototype.slice.call(arguments),
            conf = args.shift(),
            path = conf.path,
            method = conf.method || "GET",
            data = {};

        function action() {
            var args = Array.prototype.slice.call(arguments);

            if (!paramExp.test(path)) {
                if (typeof args[0] == "object") {
                    data = args.shift();
                }

                return action.request.apply(self, args);
            }

            path.match(paramExp).forEach(function(match) {
                if (typeof match == "function") {
                    throw new Error("Incorrect argument type");
                }

                if (typeof match == "object") {
                    data = match;
                    return;
                }

                path = path.replace(match, args.shift());
            });

            return action.request.apply(self, args);
        }

        action.request = function(cb) {
            if (!cb) {
                return;
            }

            var args = Array.prototype.slice.call(arguments);

            var options = {
                host: this.settings.apidomain + '.' + this.settings.host,
                port: this.settings.port,
                path: this.settings.path + path,
                method: method,
                headers: {}
            }, postdata = '';

            options.headers[this.settings.authHeader] = this.settings.token;
            options.headers['User-Agent'] = this.settings.subdomain;

            if (data.auth) {
                options.headers["Authorization"] = "Basic " + new Buffer(
                    data.auth[0] + ':' + data.auth[1]).toString("base64");

                delete data.auth;
            }

            if (Object.keys(data).length) {
                postdata = JSON.stringify(data) + '\r\n';
                options.headers["Content-Type"] = "application/json";
                options.headers["Content-Length"] = postdata.length;
            }

            // Hold data for pagination?
            var tmp = [];

            // wrap http call for automatic pagination
            var paginated_http_call = function(options, tmp) {
                
                var req = https.request(options, function(res) {
                    var ret = '';

                    res.on("data", function(chunk) {
                        ret += chunk;
                    });

                    res.on("end", function() {
                        if (res.statusCode === 401 || res.statusCode === 422) {
                            cb(res);
                        }

                        // parse the chunks, json decode, and append results to tmp
                        if (ret.length > 1) {
                            tmp = tmp.concat(JSON.parse(ret));
                        }

                        // If there is a next
                        if (res.headers.link) {

                            // Get the next link out of the header
                            var next_link = res.headers.link;
                            next_link = next_link.substring(next_link.indexOf(options.host) + options.host.length);
                            next_link = next_link.substring(0, next_link.indexOf(">"));
                            // clone the options array and change the path
                            var opt = JSON.parse(JSON.stringify(options));
                            opt.path = next_link;

                            // recursively call this function to add to tmp
                            paginated_http_call(opt, tmp);

                        } else {
                            cb(0, tmp.length > 1 ? tmp : '');
                        }
                    });

                }).on('error', function(e) {
                    cb(e.message);
                });

                postdata && req.write(postdata);

                req.end();
            }

            // Call the recursive http function
            paginated_http_call(options, tmp);
        };

        return action;
    }

    self.entries = {
        list: api({
            path: "entries"
        }),
        // Add search API
        search: api({
            path: "entries"
        }),
        add: api({
            path: "entries",
            method: "POST"
        }),
        import: api({
            path: "entries/import"
        })
    };

    self.projects = {
        list: api({
            path: "projects"
        }),
        add: api({
            path: "projects",
            method: "POST"
        })
    };

    self.tags = {
        list: api({
            path: "tags"
        })
    };

    self.users = {
        list: api({
            path: "users"
        }),
        show: api({
            path: "users/:id"
        }),
        token: api({
            path: "user/api_auth_token"
        }),
        add: api({
            path: "users",
            method: "POST"
        }),
        update: api({
            path: "users/:id",
            method: "PUT"
        }),
        remove: api({
            path: "users/:id",
            method: "DELETE"
        })
    };

    return self;
}();
