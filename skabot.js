
var objBotConfig = require('./config.js');

var fs = require('fs');
var util = require('util');
var _ = require('underscore');
var storage = require('node-persist');
var moment = require('moment');
var request = require('request').defaults({encoding: null});
var icy = require('icy');
var Discord = require('discord.js');
var requireNew = require('require-new');
var ytdl = require('ytdl-core');

var CommandInterpreter = require('./command-interpreter.js').CommandInterpreter;
var objRecords = require('./records.js');
var arrGames = require('./games.json');
var arrSounds = requireNew('./sounds.js');

var objBot = new Discord.Client();

var intBotStartTime = parseInt(moment().format('X')); // Current time in Unix seconds
var strToken;
var boolRazBash = false;
var intRazCounter = 0;
var boolConnectedToVoice = false;
var boolPlayingFile = false;
var boolPlayingUrlStream = false;
var objVoiceConnection = null;
var objUrlStream;
var objMainChannel;
var objBotChannel;

storage.initSync();

objBot.on('ready', function() {

	util.log('Bot is ready');

	objMainChannel = objBot.channels.get('id', objBotConfig.mainchannelid);
	objBotChannel = objBot.channels.get('id', objBotConfig.botchannelid);
	objVoiceChannel = objBot.channels.get('id', objBotConfig.mainvoicechannelid);

	var intGameId = storage.getItem('gameid');
	if (_.isUndefined(intGameId)) {
		intGameId = objBotConfig.defaultgameid;
	}

	objBot.setStatus(objBotConfig.status, intGameId, function(err) {
		if (_.isUndefined(err) || _.isNull(err)) {
			util.log('Status and game was set');
		} else {
			console.error(err);
		}
	});

	// If we were connected to voice channel before we restarted, we connect again
	if (storage.getItem('connectedtovoice')) {
		connectToVoice();
	}
});


objBot.on('message', function(objMessage) {

	// When our bot writes something, we don't want to interperet it
	if (objMessage.author.id == objBot.user.id) {
		return;
	}

	var objCommandInterpreter = new CommandInterpreter(objBot, objMessage);

	// Simple ping/pong functionality
	// ====================================
	objCommandInterpreter.interpret(/^ping$/, function(self) {
		self.reply('pong');
	});

	// Raz counter
	// ====================================
	if (boolRazBash) {
		objCommandInterpreter.user('Raz', function(self) {
			intRazCounter++;
			if (intRazCounter > 4) {
				self.reply('spamma lagom, tack!');
				intRazCounter = 0;
			}
		});
		objCommandInterpreter.user('!Raz', function() {
			intRazCounter = 0;
		});
	}

	// User info - silent record
	// ====================================
	objRecords.SilentRecords(objBot, objMessage);

	// Commands goes here
	// ====================================

	// Set avatar
	objCommandInterpreter.interpret(/^\/bot setavatar (https*:\/\/[a-zA-Z0-9\.\/\S]*)+$/, function(self, arrMatches) {

		var strImageUrl = arrMatches[1];

		if (strImageUrl.length) {
			setAvatar(strImageUrl, function(objResponse) {
				if (objResponse.success) {
					self.send(objResponse.message);
				} else {
					self.reply(objResponse.message);
				}
			});

		} else {
			self.reply('Du måste ange en URL till en bild också.');
		}
	}, true);

	// (something) overload
	objCommandInterpreter.interpret(/^(.{1,20}) overload$/, function(self, arrMatches) {

		var strOverload = arrMatches[1];
		var strOverloadAvatarUrl = 'https://s3-eu-west-1.amazonaws.com/acid-fileupload/1/1451080432/overload.gif';
		var strOldAvatar = storage.getItem('avatarurl');

		util.log('Retrieving overload command');

		setAvatar(strOverloadAvatarUrl, function(objResponse) {
			if (objResponse.success) {

				// Send response
				self.send(strOverload.toUpperCase() + ' OVERLOAD!');

				// Revert to old avatar
				setAvatar(strOldAvatar);

			} else {
				util.log(objResponse.message);
			}
		});
	});

	// Connect/disconnect to voice channel
	objCommandInterpreter.interpret(/^\/bot voice (connect|disconnect)$/, function(self, arrMatches) {
		var strAction = arrMatches[1];
		if (strAction == 'connect') {
			connectToVoice();
			util.log('Connecting to voice channel');
		} else if (strAction == 'disconnect') {
			disconnectFromVoice();
			util.log('Disconnecting from voice channel');
		}
	}, true);

	// Stream HappyHardcore radio
	objCommandInterpreter.interpret(/^\/bot radio (.*)$/, function(self, arrMatches, objBot, objMessage) {

		var arrStations = [
			{
				id: 1,
				name: 'HappyHardcore Radio',
				url: 'http://streaming.shoutcast.com/HappyHardcorecom-256k-'
			},
			{
				id: 2,
				name: 'Lugna Favoriter',
				url: 'http://fm03-icecast.mtg-r.net/fm03_mp3'
			},
			{
				id: 3,
				name: 'P3 Star',
				url: 'http://sverigesradio.se/topsy/direkt/1607-hi-mp3.m3u'
			},
			{
				id: 4,
				name: 'Radio Ultra',
				url: 'http://mp3.nashe.ru/ultra-128.mp3'
			},
			{
				id: 5,
				name: '24/7 DrumAndBass.com',
				url: 'http://stream.247drumandbass.com:80/'
			},
			{
				id: 6,
				name: 'PowerFM.se',
				url: 'http://media.powerfm.se:80'
			},
			{
				id: 7,
				name: 'NERadio House & Trance',
				url: 'http://fire1.neradio.com'
			}
		];

		// objBot.sendMessage(objMessage.channel, 'Ledsen, men det här kommandot är lite svårt att avbryta. Så det får vara avaktiverat tills vidare.');
		// return false;

		var strAction = arrMatches[1];
		switch (strAction) {

			case 'help':

				var strHelpMessage = "Radiokommandon \n\n" +
					"```\n" +
					"help\n"+
					"list\n" +
					"stop\n" +
					"<stations-ID>\n" +
					"```";
				self.send(strHelpMessage);

				break;

			case 'list':

				var strList = "Här är de tillgängliga radiostationerna:\n" +
					"```\n";
				_.each(arrStations, function(objStation) {
					strList += objStation.id + ". " + objStation.name + "\n";
				});
				strList += "```\n";
				self.send(strList);

				break;

			case 'stop':
				stopUrlStream();
				util.log('Stopping all radio stream');
				break;

			default:

				var intRadioId = parseInt(strAction);

				if (!boolConnectedToVoice) {
					objBot.sendMessage(objMessage.channel, 'Jag är inte ansluten till röstkanalen, så jag kan inte spela någon musik :(');
					return false;
				}

				if (boolPlayingFile) {
					self.reply('jag spelar en ljudfil just nu. Du får vänta tills att jag är klar.');
					return false;
				}

				var objStation = _.findWhere(arrStations, {id: intRadioId});
				util.log(objStation);

				if (_.isUndefined(objStation)) {
					self.reply('den stationen hittades inte.');
					return false;
				}

				if (boolPlayingUrlStream) {
					// self.reply('jag spelar redan en ljudström. Du får avbryta den om du vill spela en ny.');
					// return false;

					boolPlayingFile = false;
					boolPlayingUrlStream = false;

					objBot.voiceConnection.stopPlaying();

					// Just play the damn stream
					playUrlStream(objStation.url);

					self.send('Byter station till ' + objStation.name + ' åt ' + objMessage.author);

					util.log('Switching station to: ' + objStation.name);

				} else {

					// Just play the damn stream
					playUrlStream(objStation.url);

					self.send('Startar ' + objStation.name + ' åt ' + objMessage.author);

					util.log('Starting radio station: ' + objStation.name);

				}

				break;
		}

	});

	// Enable/disable Raz bashing
	objCommandInterpreter.interpret(/^\/bot razbash (enable|disable)$/, function(self, arrMatches) {
		var strAction = arrMatches[1];
		if (strAction == 'enable') {
			boolRazBash = true;
			util.log('Enabling Raz Bash');
		} else if (strAction == 'disable') {
			boolRazBash = false;
			util.log('Disabling Raz Bash');
		}
	}, true);

	// Set game for the bot
	objCommandInterpreter.interpret(/^\/bot setgame ([0-9]+)$/, function(self, arrMatches, objBot) {

		var intGameId = parseInt(arrMatches[1]);

		var objGame = getGameById(intGameId);

		util.log(objGame);

		objBot.setStatus(objBotConfig.status, intGameId, function(err) {
			if (_.isUndefined(err) || _.isNull(err)) {

				util.log('Status and game was updated');

				storage.setItem('gameid', intGameId);

			} else {
				console.error(err);
			}
		});

	}, true);

	// Unset the game, ie, null
	objCommandInterpreter.interpret(/^\/bot unsetgame$/, function(self, arrMatches, objBot) {
		objBot.setStatus(objBotConfig.status, null, function(err) {
			if (_.isUndefined(err) || _.isNull(err)) {
				util.log('Status and game was updated, game was unset');
				storage.setItem('gameid', null);
			} else {
				console.error(err);
			}
		});
	}, true);

	// Search game
	objCommandInterpreter.interpret(/^\/bot searchgame (.*)$/, function(self, arrMatches) {

		var strGameName = arrMatches[1];
		var arrSearchHits = _.filter(arrGames, function(objGame) {
			if (objGame.name.toLowerCase().indexOf(strGameName.toLowerCase()) > -1) {
				return true;
			}
			return false;
		});

		var strSearchResults = '';
		if (arrSearchHits.length > 0) {
			strSearchResults = 'Här är de spelen jag hittade:' + "\n\n";
			strSearchResults += "```\n|  ID | Game name \n";
			strSearchResults += "------------------------------\n"
			_.each(arrSearchHits, function(objGame) {
				strSearchResults += '| ' + pad(objGame.id, ' ', 3) + ' | ' + objGame.name + "\n";
			});
			strSearchResults += "```\n";
		} else {
			strSearchResults = 'Ledsen, men jag hittade inga spel som innehåller: ' + strGameName;
		}

		self.reply(strSearchResults);

	});

	// Uptime command
	objCommandInterpreter.interpret(/^\/bot uptime$/, function(self) {

		var intUptime = parseInt(moment().format('X')) - intBotStartTime;
		var objDuration = moment.duration(intUptime, 'seconds');

		self.reply('Tid sedan start: ' + objDuration.days() + ' dagar ' + objDuration.hours() + ' timmar ' + objDuration.minutes() + ' minuter ' + objDuration.seconds() + ' sekunder');
	});

	// Restart command, will exit and then rely on being restarted by forever-monitor
	objCommandInterpreter.interpret(/^\/bot restart$/, function(self) {
		self.reply('Startar om, BRB');
		setTimeout(function() {
			process.exit(0);
		}, 1000);
	}, false, true);

	// Help command for listing available commands
	objCommandInterpreter.interpret(/^\/bot help$/, function(self) {
		var strHelpMessage = "**Tillgängliga kommandon** (*alla börjar med /bot*)\n\n" +
			"```\n" +
			"help\n"+
			"ping\n" +
			"setavatar <bild-url>\n" +
			"voice <connect/disconnect>\n" +
			"radio <help>\n" +
			"razbash <enable/disable>\n" +
			"searchgame <game name>\n" +
			"setgame <gameid>\n" +
			"unsetgame\n" +
			"uptime\n" +
			"sounds\n" +
			"reload sounds\n" +
			"update games\n" +
			"vecka [veckonummer]\n" +
			"shitpost\n" +
			"yt <YouTube-länk>\n" +
			"sound stop\n" +
			"ssp <sten|sax|påse>\n" +
			"```\n" +
			"*Endast för admin*\n\n" +
			"```\n" +
			"restart\n" +
			"delete last <antal meddelanden>\n" +
			"```";
		self.send(strHelpMessage);
	});

	// Loading test
	objCommandInterpreter.interpret(/^\/bot load$/, function(self) {

		var intLoadSections = 20;
		var strLoadingMessage = '`[';
		for (var i = 0; i < intLoadSections; i++) {
			strLoadingMessage += '-';
		}
		strLoadingMessage += ']`';

		self.send(strLoadingMessage).then(function(objMessage) {

			var intUpdates = 0;

			var interval = setInterval(function() {

				strLoadingMessage = '`[';
				for (var i = 0; i < intLoadSections; i++) {
					if (i == intUpdates && (i + 1) != intLoadSections) {
						strLoadingMessage += '|';
					} else if (i <= intUpdates) {
						strLoadingMessage += '=';
					} else {
						strLoadingMessage += '-';
					}
				}
				strLoadingMessage += ']`';

				objBot.updateMessage(objMessage, strLoadingMessage, {}, function(error, strMessage) {
					if (error) {
						util.log('Error occured when updating message');
						console.log(error);
					}
				});

				intUpdates++;

				if (intUpdates >= intLoadSections) {
					clearInterval(interval);
				}

			}, 500);
		});
	});

	// Update games list
	objCommandInterpreter.interpret(/^\/bot update games$/, function(self) {
		updateGamesList(function(objResponse) {
			if (objResponse.success) {
				self.reply('listan med spel är nu uppdaterad');
			} else {
				self.reply('någon gick fel när jag försökte uppdatera listan med spel :(');
			}
		});
	});

	// Clear a number of messages
	objCommandInterpreter.interpret(/^\/bot delete last ([0-9]{1,3})$/, function(self, arrMatches, objBot, objMessage) {

		var intNumberOfMessages = parseInt(arrMatches[1]);

		objBot.getChannelLogs(objMessage.channel, intNumberOfMessages, {}, function(error, arrMessages) {
			if (error) {
				console.log(error);
			} else {

				_.each(arrMessages, function(objMessage) {
					objBot.deleteMessage(objMessage);
				});

				util.log('Cleaned ' + arrMessages.length + ' messages');
			}
		});

	}, true);

	// Clear a number of messages
	objCommandInterpreter.interpret(/^\/bot vecka ?([0-9]{1,2})?$/, function(self, arrMatches, objBot, objMessage) {

		var intWeekNumber = parseInt(arrMatches[1]);
		var boolWeekInput = false;

		// If we didn't get a week number in the command
		if (isNaN(intWeekNumber)) {
			var objFirstDayInWeek = moment().isoWeek(intWeekNumber);
		} else {
			if (intWeekNumber > 53) {
				self.reply('tror du seriöst att det finns fler än 53 veckor på ett år? Läs på lite: https://sv.wikipedia.org/wiki/Veckonummer');
			} else if (intWeekNumber < 1) {
				self.reply('nej, den veckan finns nog inte...')
			} else {
				var objFirstDayInWeek = moment().isoWeek(intWeekNumber);
				boolWeekInput = true;
			}
		}

		if (!_.isUndefined(objFirstDayInWeek)) {
			var intWeekNumber = objFirstDayInWeek.isoWeek();
			var strStartDate = objFirstDayInWeek.format('YYYY-MM-DD');
			var strEndDate = objFirstDayInWeek.add(6, 'days').format('YYYY-MM-DD');
			var strMessage = '';

			if (!boolWeekInput) {
				strMessage = 'Just nu är det ';
			}
			strMessage = '**Vecka ' + intWeekNumber + '** (*' + strStartDate + ' - ' + strEndDate + '*)';

			self.send(strMessage);
		}

	}, true);

	// Reload sounds
	objCommandInterpreter.interpret(/^\/bot reload sounds$/, function(self) {
		arrSounds = requireNew('./sounds.js');
		self.reply('ljudlistan är nu inladdad på nytt.')
	}, true);

	// Shitpost
	objCommandInterpreter.interpret(/^\/bot shitpost$/, function(self, arrMatches, objBot, objMessage) {
		var arrShitposts = requireNew('./shitposts.js');
		var intRand = _.random(0, arrShitposts.length - 1);
		objRecords.ShitPost(objMessage.author);
		self.send(arrShitposts[intRand] + "\n*– " + objMessage.author + "*");
	}, true);

	// Stone paper scissors
	objCommandInterpreter.interpret(/^\/(bot )?(ssp|sten sax påse) (.+)$/, function(self, arrMatches, objBot, objMessage) {

		var arrAvailableChoices = [
			{
				key: 'sten',
				emoji: '💎',
				value: 0
			},
			{
				key: 'påse',
				emoji: '💰',
				value: 1
			},
			{
				key: 'sax',
				emoji: '✂️',
				value: 2
			}
		];

		var strUserChoice = arrMatches[3];
		var objUserChoice = _.findWhere(arrAvailableChoices, {key: strUserChoice});

		if (!_.isUndefined(objUserChoice)) {

			var objBotChoice = _.sample(arrAvailableChoices);
			var objResultAndStats = objRecords.RockPaperScissors(objMessage.author, objUserChoice, objBotChoice);

			var boolResult = objResultAndStats.boolResult;
			var objUserStats = objResultAndStats.objUserStats;

			var strMessage = '';

			if (_.isNull(boolResult)) {
				strMessage = '😕 **Oavgjort.**';
			} else if (boolResult) {
				strMessage = '⭐ **Du vann!**'
			} else {
				strMessage = '😞 **Du förlorade...**';
			}

			var floatWinLoseQuote = (objUserStats.wins / objUserStats.losses);
			if (isNaN(floatWinLoseQuote)) {
				floatWinLoseQuote = 0;
			}
			var strWinLoseQuote = floatWinLoseQuote.toFixed(2);

			strMessage += "\n";
			strMessage += 'Ditt val: `' + objUserChoice.key + '` ' + objUserChoice.emoji + ', botens val: `' + objBotChoice.key + '` ' + objBotChoice.emoji + "\n";
			strMessage += '*Din vinst/förlust-kvot: `' + strWinLoseQuote + '` Totala vinster: `' + objUserStats.wins + '` Totala förluster: `' + objUserStats.losses + '` Oavgjort: `' + objUserStats.ties + '`*';

			self.send(strMessage);

		} else {
			self.reply('vet du ens hur man spelar sten-sax-påse?');
		}

	});

	// Play YouTube audio
	objCommandInterpreter.interpret(/^\/bot yt http(?:s)?:\/\/(?:www.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i, function(self, arrMatches, objBot, objMessage) {


		if (boolPlayingFile || boolPlayingUrlStream) {
			self.reply('jag spelar redan ljud/musik/video.');
			return;
		}

		var strRequestUrl = 'http://youtube.com/watch?v=' + arrMatches[1];

		// Add the time if provided
		var arrTimestampMatch = arrMatches['input'].match(/\?t=(([0-9]+[h|m])*([0-9]{0,2}s))/i);
		if (!_.isNull(arrTimestampMatch)) {
			strRequestUrl += '&t=' + arrTimestampMatch[1];
		}

		util.log('Starting YouTube clip: ' + strRequestUrl);

		ytdl.getInfo(strRequestUrl, (err, info) => {

			if (err) {
				util.log(err);
			} else {

				var objStream = ytdl.downloadFromInfo(info, {
					filter: (format) => format.container === 'mp4',
					quality: 'lowest'
				});

				boolPlayingFile = true;

				objBot.voiceConnection.playRawStream(objStream).then((objStreamIntent) => {

					objStreamIntent.on('end', function() {
						util.log('YouTube clip: ' + info.title + ' is done playing');
						boolPlayingFile = false;
						// objBot.voiceConnection.stopPlaying();
					});

				});

				var intViews = parseInt(info.view_count);

				var objMomentDuration = moment.duration(parseInt(info.length_seconds), 'seconds');
				var strLength = pad(objMomentDuration.minutes(), '0', 2) + ':' + pad(objMomentDuration.seconds(), '0', 2);
				if (objMomentDuration.hours() > 0) {
					strLength = objMomentDuration.hours() + ':' + strLength;
				}

				self.send('Nu spelas: **' + info.title + "**\n" + info.author + ' - __' + strLength + '__ - __' + intViews.addThousandSep() + '__ visningar - Önskad av ' + objMessage.author);

			}
		}, true);

	}, true);

	// Stop audio
	objCommandInterpreter.interpret(/^\/bot sound stop$/, function(self, arrMatches, objBot, objMessage) {
		if (boolPlayingFile || boolPlayingUrlStream) {

			boolPlayingFile = false;
			boolPlayingUrlStream = false;

			self.send('Alla ljud har nu stoppats av ' + objMessage.author);

			objBot.voiceConnection.stopPlaying();

		} else {
			self.send('Det finns inga ljud att stoppa...');
		}
	}, true);

	// Here goes all sounds
	_.each(arrSounds, function(objSound) {
		objCommandInterpreter.interpret(objSound.strRegex, function(self, arrMatches, objBot, objMessage) {

			if (!_.isUndefined(objSound.boolDisabled) && objSound.boolDisabled) {
				self.reply('ledsen, men "*' + objSound.strName + '*" har blivit inaktiverat :(');
				return;
			}

			playFile(objSound.strFileName);
			objRecords.SoundRecords(objSound, objMessage.author);
		}, true);
	});

	// List all sounds
	objCommandInterpreter.interpret(/^\/bot sounds$/, function(self) {
		var strList = '**Här är alla tillgängliga ljud:**' + "\n```";

		var boolOdd = true;
		var i = 1;
		_.each(arrSounds, function(objSound) {

			if (_.isUndefined(objSound.boolHide) || !objSound.boolHide) {

				// Here you go, try to read this... you piece of shit...
				if (boolOdd) {
					var strPadding = Array(25 - objSound.strName.length).join(' ');
					strList += '| ' + pad((i), ' ', 2) + '. ' + objSound.strName + strPadding;
				} else {
					strList += '| ' + pad((i), ' ', 2) + '. ' + objSound.strName + "\n";
				}

				boolOdd = !boolOdd;
				i++;
			}
		});
		strList += "```\n";
		strList += "Statistik: http://skabot.acid.nu/\n";
		self.send(strList);
	});

});

util.log('App initialized, now logging in...');

objBot.login(objBotConfig.email, objBotConfig.password, function(err, token) {

	if (_.isNull(err)) {
		util.log('Login complete');
		strToken = token;
	} else {
		console.error('Login failed');
		console.error(err);
	}

});

objBot.on('serverNewMember', function(objServer, objUser) {
	util.log('New user: ' + objUser.username);
	objBot.sendMessage(objMainChannel, objUser.username + ' har precis anslutit för första gången!');
});

objBot.on('warn', function(strWarning) {
	util.log('Warning');
	util.log(strWarning);
});

objBot.on('debug', function(varVariable) {
	util.log('Debug');
	util.log(varVariable);
});

function connectToVoice(funcCallback) {
	if (_.isUndefined(objVoiceChannel)) {
		return false;
	}

	objBot.joinVoiceChannel(objVoiceChannel, function(err, objConnection) {
		if (_.isUndefined(err) || _.isNull(err)) {

			boolConnectedToVoice = true;
			objVoiceConnection = objConnection;
			storage.setItem('connectedtovoice', true);

			if (_.isFunction(funcCallback)) {
				funcCallback();
			}

			util.log('Voice channel joined');

		} else {
			console.error(err);
		}

	});
}

function disconnectFromVoice(funcCallback) {
	objBot.leaveVoiceChannel(function(err, objConnection) {
		if (_.isUndefined(err) || _.isNull(err)) {
			boolConnectedToVoice = false;
			objVoiceConnection = null;
			storage.setItem('connectedtovoice', false);
			if (_.isFunction(funcCallback)) {
				funcCallback();
			}
			util.log('Voice channel disconnected');
		} else {
			console.error(err);
		}

	});
}

function playUrlStream(strUrlStream) {

	objBot.voiceConnection.playFile(strUrlStream, function(stream) {
		boolPlayingUrlStream = true;
	});

}

function stopUrlStream() {
	if (!_.isNull(objBot.voiceConnection)) {
		objBot.voiceConnection.stopPlaying();
	}
	boolPlayingUrlStream = false;
}

function playFileCallback(funcCallback) {
	boolPlayingFile = false;
	if (_.isFunction(funcCallback)) {
		funcCallback();
	}
}

function playFile(strFileName, funcCallback) {

	// If we are already playing a sound file, just dismiss this
	if (boolPlayingFile) {
		return false;
	}

	boolPlayingFile = true;

	if (boolPlayingUrlStream) {
		objBot.sendMessage(objMainChannel, 'Jag spelar för tillfället en ljudström, du måste stoppa den först. (/bot sound stop)');
		return false;
	}

	if (!boolConnectedToVoice) {

		connectToVoice(function() {
			objBot.voiceConnection.playFile('sounds/' + strFileName, function(stream) {
				util.log('Playing:', strFileName);
			}).then((objStreamIntent) => {
				objStreamIntent.on('end', function() {
					playFileCallback(disconnectFromVoice);
				});
			});
		});

		return false;
	}

	objBot.voiceConnection.playFile('sounds/' + strFileName, function(stream) {
		util.log('Playing:', strFileName);
	}).then((objStreamIntent) => {

		objStreamIntent.on('end', function() {
			playFileCallback(funcCallback);
		});

	});
}

function pad(strInput, strPadCharacter, intPadWidth) {
	var strPadding = Array(10).join(strPadCharacter);
	return (strPadding + strInput).substr(-intPadWidth);
}

function updateGamesList(funcCallback) {

	var strGamesListUrl = 'https://abal.moe/Discord/JSON/games.json';

	request.get(strGamesListUrl, function (error, response, body) {

		if (!error && response.statusCode == 200) {

			fs.writeFile('games.json', body.toString(), function (err) {
				if (err) {
					console.error(err);
				} else {
					util.log('games.json file updated');

					if (_.isFunction(funcCallback)) {
						funcCallback({success: true});
					}
				}
			});

		} else {
			console.error(error);
			util.log(response);

			if (_.isFunction(funcCallback)) {
				funcCallback({success: false, error: error, response: response});
			}
		}

	});

}

function setAvatar(strImageUrl, funcCallback) {

	var boolSuccess;
	var strResponseText;

	request.get(strImageUrl, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var strImageBase64 = 'data:' + response.headers['content-type'] + ';base64,' + new Buffer(body).toString('base64');

			objBot.setAvatar(strImageBase64, function(objStatus) {
				if (_.isObject(objStatus) || !_.isNull(objStatus)) {

					boolSuccess = true;
					strResponseText = 'Klart, min avatar har uppdaterats.';

					// Save the URL for later
					storage.setItem('avatarurl', strImageUrl);

				} else {

					boolSuccess = false;
					strResponseText = 'Något gick fel när jag försökte ändra min avatar, kolla loggarna.';

					console.error(objStatus);
				}

				if (_.isFunction(funcCallback)) {
					funcCallback({
						success: boolSuccess,
						message: strResponseText
					});
				}
			});

		} else {

			boolSuccess = false;
			strResponseText = 'Ledsen, men jag lyckas inte komma åt den där bilden.';

			util.log(error);
			util.log(response);

			if (_.isFunction(funcCallback)) {
				funcCallback({
					success: boolSuccess,
					message: strResponseText
				});
			}
		}
	});
}

function getGameById(intGameId) {
	var objGame = _.where(arrGames, {id: intGameId});
	return objGame;
}

Number.prototype.addThousandSep = function() {
	var rx = /(\d+)(\d{3})/;
	return String(this.valueOf()).replace(/^\d+/, function(w){
		while (rx.test(w)) {
			w = w.replace(rx, '$1 $2');
		}
		return w;
	});
};

process.on('uncaughtException', function(err) {
	// Handle ECONNRESETs caused by `next` or `destroy`
	if (err.code == 'ECONNRESET') {
		// Yes, I'm aware this is really bad node code. However, the uncaught exception
		// that causes this error is buried deep inside either discord.js, ytdl or node
		// itself and after countless hours of trying to debug this issue I have simply
		// given up. The fact that this error only happens *sometimes* while attempting
		// to skip to the next video (at other times, I used to get an EPIPE, which was
		// clearly an error in discord.js and was now fixed) tells me that this problem
		// can actually be safely prevented using uncaughtException. Should this bother
		// you, you can always try to debug the error yourself and make a PR.
		console.log('Got an ECONNRESET! This is *probably* not an error. Stacktrace:');
		console.log(err.stack);
	} else {
		// Normal error handling
		console.log(err);
		console.log(err.stack);
		process.exit(0);
	}
});
