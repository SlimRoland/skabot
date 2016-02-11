var _ = require('underscore');
var util = require('util');
var moment = require('moment');
var storage = require('node-persist');

// This is really important, I forgot about that
storage.initSync();

module.exports = {

	SilentRecords: function(objBot, objMessage) {

		var arrUsersInfo = storage.getItem('users_info');

		if (_.isUndefined(arrUsersInfo)) {
			arrUsersInfo = [];
		}

		var strCurrentTime = moment().format('YYYY-MM-DD HH:mm:ss');

		var objUserInfo = _.find(arrUsersInfo, {id: objMessage.author.id});
		if (_.isUndefined(objUserInfo)) {
			objUserInfo = {
				'id': objMessage.author.id,
				'username': objMessage.author.username,
				'last_message_datetime_datetime': strCurrentTime,
				'current_record': 0,
				'messages_since_last_record': 0
			};
			arrUsersInfo.push(objUserInfo);
		}

		var intIndex = _.indexOf(arrUsersInfo, objUserInfo);

		var intSecondsSinceLastMessage = moment().diff(moment(objUserInfo.last_message_datetime), 'seconds');

		// Is the record broken? And is it at least 5 minutes
		if (intSecondsSinceLastMessage > objUserInfo.current_record && intSecondsSinceLastMessage > 300) {

			util.log(objMessage.author.username + ' broke a silence record with ' + intSecondsSinceLastMessage + ' seconds and ' + objUserInfo.messages_since_last_record + ' messages');

			// Set to Swedish here
			moment.locale('sv');

			// objBot.reply(objMessage, 'Grattis, du har slagit tysthetsrekord, det har gått ' + moment.duration(intSecondsSinceLastMessage, 'seconds').humanize() + ' sedan du skrev något senast. Du har skickat ' + objUserInfo.messages_since_last_record + ' meddelanden sedan ditt senaste rekord.');

			// Reset some variables now
			objUserInfo.current_record = intSecondsSinceLastMessage;
			objUserInfo.messages_since_last_record = 0;

		} else {
			objUserInfo.messages_since_last_record++;
		}

		// Always reset the last_message_datetime
		objUserInfo.last_message_datetime = strCurrentTime;

		arrUsersInfo[intIndex] = objUserInfo;

		// At last we save everything
		storage.setItem('users_info', arrUsersInfo);
	},

	SoundRecords: function(objSound, objUser) {

		var objSoundsStats = storage.getItem('sound_stats');
		if (_.isUndefined(objSoundsStats)) {
			objSoundsStats = {};
		}

		// Check if we have an entry for this sound, if not, create it
		if (_.isUndefined(objSoundsStats[objSound.strName])) {
			objSoundsStats[objSound.strName] = {};
		}

		var objSoundStats = objSoundsStats[objSound.strName];

		if (_.isUndefined(objSoundStats[objUser.id])) {
			objSoundStats[objUser.id] = {
				username: '',
				plays: 0,
				log: []
			};
		}

		var objUserStats = objSoundStats[objUser.id];

		objUserStats['username'] = objUser.username;
		objUserStats['plays']++;
		objUserStats['log'].push(moment().format());

		objSoundStats[objUser.id] = objUserStats;
		objSoundsStats[objSound.strName] = objSoundStats;

		storage.setItem('sound_stats', objSoundsStats);

	},

	ShitPost: function(objUser) {

		var arrShitPostLog = storage.getItem('shitpost_log');
		if (_.isUndefined(arrShitPostLog)) {
			arrShitPostLog = [];
		}

		arrShitPostLog.push({
			user_id: objUser.id,
			username: objUser.username,
			time: moment().format()
		});

		storage.setItem('shitpost_log', arrShitPostLog);

	},

	RockPaperScissors: function(objUser, objUserChoice, objBotChoice) {

		var boolResult = null;
		var intUserChoice = objUserChoice.value;
		var intBotChoice = objBotChoice.value;

		if (intUserChoice == intBotChoice) {
			// A tie is a null...
		} else if ((intUserChoice - intBotChoice + 3) % 3 == 1) {
			boolResult = true;
		} else {
			boolResult = false;
		}

		var arrRpsStats = storage.getItem('rps_stats');
		if (_.isUndefined(arrRpsStats)) {
			arrRpsStats = [];
		}

		var objUserStats = _.findWhere(arrRpsStats, {user_id: objUser.id});
		if (_.isUndefined(objUserStats)) {
			var objUserStats = {
				user_id: objUser.id,
				username: null,
				wins: 0,
				losses: 0,
				ties: 0
			};

			arrRpsStats.push(objUserStats);
		}

		var intIndex = _.indexOf(arrRpsStats, objUserStats);

		// Always overwrite the username, since it can change
		objUserStats.username = objUser.username;

		if (_.isNull(boolResult)) {
			objUserStats.ties++;
		} else if (boolResult) {
			objUserStats.wins++;
		} else {
			objUserStats.losses++;
		}

		arrRpsStats[intIndex] = objUserStats;
		storage.setItem('rps_stats', arrRpsStats);

		return {
			boolResult: boolResult,
			objUserStats: objUserStats
		}

	}

}
