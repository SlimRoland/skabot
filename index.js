
var forever = require('forever-monitor');

var SKABot = new (forever.Monitor)('skabot.js', {
	max: 50,
	silent: false,
	args: [],
	watch: true,
	sourceDir: './',
	watchDirectory: './',
	watchIgnoreDotFiles: true,
	watchIgnorePatterns: ['./persist/*', './node_modules/*']
});

SKABot.on('watch:restart', function(info) {
	console.error('Restaring script skabot.js because ' + info.file + ' changed');
});
SKABot.on('restart', function() {
	console.error('Forever restarting script skabot.js for ' + SKABot.times + ' time');
});
SKABot.on('exit', function () {
	console.log('skabot.js has exited after ' + SKABot.max + ' restarts');
});

SKABot.start();

var objBotStats = new (forever.Monitor)('sound-stats.js', {
	max: 50,
	silent: false,
	args: [],
	watch: true,
	sourceDir: './',
	watchDirectory: './',
	watchIgnoreDotFiles: true,
	watchIgnorePatterns: ['./persist/*', './node_modules/*']
});

objBotStats.on('watch:restart', function(info) {
	console.error('Restaring script sound-stats.js because ' + info.file + ' changed');
});
objBotStats.on('restart', function() {
	console.error('Forever restarting sound-stats.js script for ' + objBotStats.times + ' time');
});
objBotStats.on('exit', function () {
	console.log('sound-stats.js has exited after ' + objBotStats.max + ' restarts');
});

objBotStats.start();
