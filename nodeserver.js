var httpProxy = require('http-proxy');
var proxy = httpProxy.createProxy();
var urlparser = require('url');
var fs = require('fs');
var forever = require('forever-monitor');
var path = require('path');
require('colors');

module.exports = exports = new function() {
	var self = this;
	this.websites = [];
	this.ports = [];
	this.servers = [];


	this.serverWorker = function(req, res) {
		var host = req.headers.host;
		var website = self.getWebsiteFromUrl(host);

		if(website == null) {
			website = self.getWebsiteFromUrl(host + ":80");
		}

		if(website == null) {
			res.end();
			return;
		}

		proxy.web(req, res, {
			target: website.target
		}, function(e) {
			console.log(e);
		});
	};

	this.getWebsiteFromUrl = function(url) {
		var websitesCount = this.websites.length;

		console.log(url);

		for(var i = 0; i < websitesCount; i++) {
			var website = this.websites[i];
			var bindingsCount = website.bindings.length;

			for(var j = 0; j < bindingsCount; j++) {
				var binding = website.bindings[j];

				if(binding == url) {
					return website;
				}
			}
		}
	}


	this.readConfigFile = function(configFile) {
		configFile = configFile || "nodeserver.config";
		var config = null;

		if(fs.existsSync(configFile)) {
			config = fs.readFileSync(configFile);
		} else if(fs.existsSync(__dirname + configFile)) {
			config = fs.readFileSync(__dirname + configFile);
		}  else if(fs.existsSync(__dirname + "/" + configFile)) {
			config = fs.readFileSync(__dirname + "/" + configFile);
		} else if(fs.existsSync("/etc/nodeserver/nodeserver.config")) {
			config = fs.readFileSync("/etc/nodeserver/nodeserver.config");
		}

		var jsonConfig = JSON.parse(config);

		for(var i = 0; i < jsonConfig.length; i++) {
			this.addWebsite(jsonConfig[i]);
		}
	}


	this.addWebsite = function(website) {
		console.log("add url: ".grey + website.name.blue);

		if(website.type == "node") {
			this.startChild(website);
		}

		for(var i = 0; i < website.bindings.length; i++) {
			url = urlparser.parse("http://" + website.bindings[i]);

			this.addPort(url.port);
		}

		website.port = website.port || (Math.floor(Math.random() * 65000) + 20000);
		website.target = website.target || "http://localhost:" + website.port;

		this.websites.push(website);
	};


	this.addPort = function(port) {
		for(var i = 0; i < this.ports.length; i++) {
			if(this.ports[i] == port) {
				return;
			}
		}

		this.ports.push(port);
	};


	this.startChild = function(website) {
		var scriptPath = "";
		var script = "";
		var port = website.port;

		if(website.absoluteScript) {
			scriptPath = path.dirname(website.script);
		} else {
			scriptPath = process.cwd() + "/" + path.dirname(website.script);
		}

		script = path.basename(website.script);

		console.log("SCRIPT: " + script);
		console.log("PATH: " + scriptPath);
		console.log("PORT: " + port);

		var childConfig = {
			spinSleepTime: 10000,
			max: 3,
			silent: false,
			options: [],
			sourceDir: scriptPath,
			cwd: scriptPath,
			env: { 'PORT': port }
		};

		var child = new (forever.Monitor)(script, childConfig);

		child.on('exit', function (forever) {
			console.log('Closing script ' + forever.args[0]);
		});

		child.start();

		var watchFucntion = function (curr, prev) {
			child.stop();
			
			setTimeout(function() {
				child.start();
			}, 1000);
		};
		
		fs.watchFile(scriptPath + '/' + script, watchFucntion);
		fs.watchFile(scriptPath + '/package.json', watchFucntion);

		return website;
	}


	this.start = function() {
		var ports = this.ports.length;

		for(var i = 0; i < ports; i++) {
			var server = require('http').createServer(this.serverWorker);
			server.listen(this.ports[i]);

			this.servers.push(server);
		}
	};


	this.stop = function() {
		for(var i = 0; i < this.servers.length; i++) {
			this.servers[i].close();
		}
	};


	this.restart = function() {
		this.stop();
		this.start();
	};
};