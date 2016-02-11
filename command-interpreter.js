var objBotConfig = require('./config.js');

module.exports = {
	CommandInterpreter: function(objBot, objMessage) {

		var parent = this;

		this.reply = function(strMessage) {
			return objBot.reply(objMessage, strMessage);
		}

		this.send = function(strMessage) {
			return objBot.sendMessage(objMessage.channel, strMessage);
		}

		this.interpret = function(strPregmatch, funcCallback, boolDeleteMessage, boolAdminOnlyCommand) {

			var boolDeleteMessage = boolDeleteMessage || false;
			var boolAdminOnlyCommand = boolAdminOnlyCommand || false;

			if (boolAdminOnlyCommand && objMessage.author.id != objBotConfig.adminuserid) {
				return false;
			}

			try {
				var arrMatches = objMessage.content.match(strPregmatch);
			} catch (err) {
				console.error(err);
			}
			if (arrMatches !== null) {

				if (boolDeleteMessage) {
					objBot.deleteMessage(objMessage);
				}

				funcCallback(parent, arrMatches, objBot, objMessage);

				return true;
			}

			return false;
		}

		this.user = function(strUsername, funcCallback, boolDeleteMessage) {

			var boolDeleteMessage = boolDeleteMessage || false;

			var boolMatch = false;
			var boolInverted = strUsername.substring(0, 1) == '!';
			var strUsername = (boolInverted) ? strUsername.substring(1) : strUsername;

			if (boolInverted && strUsername != objMessage.author.username) {
				boolMatch = true;
			} else if (!boolInverted && strUsername == objMessage.author.username) {
				boolMatch = true;
			}

			if (boolMatch) {

				if (boolDeleteMessage) {
					objBot.deleteMessage(objMessage);
				}

				funcCallback(parent, objBot, objMessage);

				return true;
			}

			return false;
		}

	}
}
