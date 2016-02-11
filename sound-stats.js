var express = require('express');
var app = express();
var mu = require('mu2');

var _ = require('underscore');
var fs = require('fs');
var util = require('util');
var moment = require('moment');
var storage = require('node-persist');
var arrSounds = require('./sounds.js');

storage.initSync();
mu.root = __dirname + '/templates';

app.get('/', function(req, res) {
	var stream = mu.compileAndRender('index.mustache', {});
	stream.pipe(res);
});

app.get('/topplistan', function(req, res) {

	mu.clearCache();

	var arrTotalPlays = getSoundStats();
	var stream = mu.compileAndRender('top-sounds.mustache', {arrTotalPlays: arrTotalPlays});
	stream.pipe(res);

});

app.get('/anvandartoppen', function(req, res) {

	mu.clearCache();

	var arrUsersStats = getUsersStats();
	var stream = mu.compileAndRender('top-users.mustache', {arrUsersStats: arrUsersStats});
	stream.pipe(res);

});

app.get('/sound/:soundname', function(req, res) {

	var strSoundFilename = req.params.soundname;

	try {
		var filePath = './sounds/' + strSoundFilename;
		var stat = fs.statSync(filePath);

		res.writeHead(200, {
			'Content-Type': 'audio/mpeg',
			'Content-Length': stat.size
		});

		var readStream = fs.createReadStream(filePath);

		readStream.pipe(res);
	} catch (Err) {
		res.status(404).end('File not found');
	}

});

app.get('/stats/:soundname', function(req, res) {

	mu.clearCache();

	var strSoundFilename = req.params.soundname;

	var objSoundStats = getSingleSoundStats(strSoundFilename);
	var stream = mu.compileAndRender('sound-stats.mustache', {objSoundStats: objSoundStats});
	stream.pipe(res);

});

app.get('/user/:userid', function(req, res) {

	mu.clearCache();

	var strUserId = req.params.userid;

	var objUserStats = getSingleUserStats(strUserId);
	var stream = mu.compileAndRender('user-stats.mustache', {objUserStats: objUserStats});
	stream.pipe(res);

});

app.get('/historik', function(req, res) {

	mu.clearCache();

	var arrTotalHistory = getHistory();
	arrTotalHistory = _.first(arrTotalHistory, 100);
	var stream = mu.compileAndRender('history.mustache', {arrTotalHistory: arrTotalHistory});
	stream.pipe(res);

});

app.listen(3000, function() {
	console.log('Server ready');
})

function getSoundStats() {

	storage.initSync();
	var objSoundsStats = storage.getItem('sound_stats');

	var arrTotalPlays = [];

	_.each(_.keys(objSoundsStats), function(strSoundName) {

		var objSound = objSoundsStats[strSoundName];

		var intTotalPlays = 0;
		var intTopPlayerPlays = 0;
		var strTopPlayer = '';

		_.each(_.keys(objSound), function(strUserId) {

			var objUserStats = objSound[strUserId];

			if (objUserStats.plays > intTopPlayerPlays) {
				intTopPlayerPlays = objUserStats.plays;
				strTopPlayer = objUserStats.username;
			}

			intTotalPlays += objUserStats.plays;

		});

		var strFileName = false;

		var objSound = _.findWhere(arrSounds, {strName: strSoundName});
		if (!_.isUndefined(objSound)) {
			strFileName = objSound.strFileName;
		} else {
			arrSounds = require('./sounds.js');
		}

		arrTotalPlays.push({
			sound_name: strSoundName,
			file_name: strFileName,
			total_plays: intTotalPlays,
			top_player: strTopPlayer,
			top_player_plays: intTopPlayerPlays,
			player_percentage: Math.round(intTopPlayerPlays / intTotalPlays * 100)
		});

	});

	arrTotalPlays = _.sortBy(arrTotalPlays, 'total_plays').reverse();
	var i = 1;
	_.each(arrTotalPlays, function(objSoundStats, intIndex) {
		arrTotalPlays[intIndex].place = i++;
	});

	return arrTotalPlays;

}

function getSingleSoundStats(strFilename) {

	storage.initSync();

	var objSoundsStats = storage.getItem('sound_stats');
	var objSound = _.findWhere(arrSounds, {strFileName: strFilename});

	var objSoundStats = objSoundsStats[objSound.strName];

	var arrHistory = [];
	_.each(_.keys(objSoundStats), function(strUserId) {

		var objCurrentUserStats = objSoundStats[strUserId];

		_.each(objCurrentUserStats.log, function(strDateTime) {
			arrHistory.push({
				user_id: strUserId,
				username: objCurrentUserStats.username,
				time: strDateTime,
				better_time: moment(strDateTime).format('YYYY-MM-DD HH:mm:ss')
			});
		});

	});

	var arrUserStats = [];
	_.each(_.keys(objSoundStats), function(strUserId) {

		var objCurrentUserStats = objSoundStats[strUserId];

		arrUserStats.push({
			user_id: strUserId,
			username: objCurrentUserStats.username,
			plays: objCurrentUserStats.plays,
			player_percentage: Math.round(objCurrentUserStats.plays / arrHistory.length * 100)
		});

	});

	arrUserStats = _.sortBy(arrUserStats, 'plays').reverse()
	var i = 1;
	_.each(arrUserStats, function(objUserStats, intIndex) {
		arrUserStats[intIndex].place = i++;

		var objSingleUserStats = getSingleUserStats(objUserStats.user_id, false);
		arrUserStats[intIndex].favorite = (objSingleUserStats.sound_stats[0].sound_name == objSound.strName);

	});

	return {
		sound_name: objSound.strName,
		file_name: strFilename,
		total_plays: arrHistory.length,
		history: _.sortBy(arrHistory, 'time').reverse(),
		user_stats: arrUserStats
	}

}

function getUsersStats() {

	storage.initSync();
	var objSoundsStats = storage.getItem('sound_stats');

	var arrUsersStats = [];

	_.each(_.keys(objSoundsStats), function(strSoundName) {

		var objSoundStats = objSoundsStats[strSoundName];
		var objSound = _.findWhere(arrSounds, {strName: strSoundName});

		var strFileName = false;
		if (!_.isUndefined(objSound)) {
			strFileName = objSound.strFileName;
		} else {
			arrSounds = require('./sounds.js');
		}

		_.each(_.keys(objSoundStats), function(strUserId) {

			var objSoundUserStats = objSoundStats[strUserId];
			var objMainUserStats = _.findWhere(arrUsersStats, {user_id: strUserId});

			if (_.isUndefined(objMainUserStats)) {

				objMainUserStats = {
					user_id: strUserId,
					username: objSoundUserStats.username,
					total_plays: objSoundUserStats.plays,
					top_sound: {
						sound_name: strSoundName,
						plays: objSoundUserStats.plays,
						file_name: strFileName
					}
				}

				arrUsersStats.push(objMainUserStats);

			} else {

				var intIndex = _.indexOf(arrUsersStats, objMainUserStats);

				objMainUserStats.total_plays += objSoundUserStats.plays;

				if (objMainUserStats.top_sound.plays < objSoundUserStats.plays) {
					objMainUserStats.top_sound = {
						sound_name: strSoundName,
						plays: objSoundUserStats.plays,
						file_name: strFileName
					}
				}

				arrUsersStats[intIndex] = objMainUserStats;

			}

		});

	});

	var intTotalPlaysAcrossAllUsers = _.reduce(arrUsersStats, function(memo, objMainUserStats) {
		return memo + objMainUserStats.total_plays;
	}, 0);

	arrUsersStats = _.sortBy(arrUsersStats, 'total_plays').reverse()
	var i = 1;
	_.each(arrUsersStats, function(objUserStats, intIndex) {
		arrUsersStats[intIndex].place = i++;
		arrUsersStats[intIndex].player_percentage = Math.round(objUserStats.total_plays / intTotalPlaysAcrossAllUsers * 100);
	});

	return arrUsersStats;

}

function getSingleUserStats(strUserId, boolIncludeHistory) {

	if (_.isUndefined(boolIncludeHistory)) {
		boolIncludeHistory = true;
	}

	storage.initSync();
	var objSoundsStats = storage.getItem('sound_stats');

	var arrUserHistory = [];
	var	arrSoundStats = [];
	var intTotalPlays = 0;
	var strUsername = '';

	_.each(_.keys(objSoundsStats), function(strSoundName) {

		var objUserSoundStats = objSoundsStats[strSoundName][strUserId];
		var objSound = _.findWhere(arrSounds, {strName: strSoundName});

		var strFileName = false;
		if (!_.isUndefined(objSound)) {
			strFileName = objSound.strFileName;
		} else {
			arrSounds = require('./sounds.js');
		}

		if (!_.isUndefined(objUserSoundStats)) {

			strUsername = objUserSoundStats.username;
			intTotalPlays += objUserSoundStats.plays;

			if (boolIncludeHistory) {
				_.each(objUserSoundStats.log, function(strDateTime) {
					arrUserHistory.push({
						sound_name: strSoundName,
						file_name: strFileName,
						time: strDateTime,
						better_time: moment(strDateTime).format('YYYY-MM-DD HH:mm:ss')
					});
				});
			}

			var objMainSoundStats = _.findWhere(arrSoundStats, {user_id: strUserId});

			if (_.isUndefined(objMainSoundStats)) {

				objMainSoundStats = {
					sound_name: strSoundName,
					plays: objUserSoundStats.plays,
					file_name: strFileName
				}

				arrSoundStats.push(objMainSoundStats);

			} else {

				var intIndex = _.indexOf(arrSoundStats, objMainSoundStats);
				objMainSoundStats.plays += objUserSoundStats.plays;
				arrSoundStats[intIndex] = objMainSoundStats;

			}

		}

	});

	arrSoundStats = _.sortBy(arrSoundStats, 'plays').reverse()
	var i = 1;
	_.each(arrSoundStats, function(objSoundStats, intIndex) {
		arrSoundStats[intIndex].place = i++;
		arrSoundStats[intIndex].play_percentage = Math.round(objSoundStats.plays / intTotalPlays * 100);
	});

	return {
		history: _.sortBy(arrUserHistory, 'time').reverse(),
		sound_stats: arrSoundStats,
		total_plays: intTotalPlays,
		username: strUsername
	}

}

function getHistory() {

	storage.initSync();
	var objSoundsStats = storage.getItem('sound_stats');

	var arrTotalHistory = [];

	_.each(_.keys(objSoundsStats), function(strSoundName) {

		var objSoundStats = objSoundsStats[strSoundName];
		var objSound = _.findWhere(arrSounds, {strName: strSoundName});

		var strFileName = false;
		if (!_.isUndefined(objSound)) {
			strFileName = objSound.strFileName;
		} else {
			// If we couldn'Ãt find the sound, it's probably new and the list needs to be reloaded
			arrSounds = require('./sounds.js');
		}

		_.each(_.keys(objSoundStats), function(strUserId) {

			var objCurrentUserStats = objSoundStats[strUserId];

			_.each(objCurrentUserStats.log, function(strDateTime) {
				arrTotalHistory.push({
					sound_name: strSoundName,
					file_name: strFileName,
					username: objCurrentUserStats.username,
					user_id: strUserId,
					time: strDateTime,
					better_time: moment(strDateTime).format('YYYY-MM-DD HH:mm:ss')
				});
			});

		});

	});


	return _.sortBy(arrTotalHistory, 'time').reverse();

}
