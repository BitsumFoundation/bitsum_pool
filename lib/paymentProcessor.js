var fs = require('fs');

var async = require('async');

var apiInterfaces = require('./apiInterfaces.js')(config.daemon, config.wallet, config.api);


var logSystem = 'payments';
require('./exceptionWriter.js')(logSystem);


log('info', logSystem, 'Started');


function runInterval(){
    async.waterfall([

        //Get worker keys
        function(callback){
            redisClient.keys(config.coin + ':workers:*', function(error, result) {
                if (error) {
                    log('error', logSystem, 'Error trying to get worker balances from redis %j', [error]);
                    callback(true);
                    return;
                }
                callback(null, result);
            });
        },

        //Get worker balances
        function(keys, callback){
            var redisCommands = keys.map(function(k){
                return ['hget', k, 'balance'];
            });
            redisClient.multi(redisCommands).exec(function(error, replies){
                if (error){
                    log('error', logSystem, 'Error with getting balances from redis %j', [error]);
                    callback(true);
                    return;
                }
                var balances = {};
                for (var i = 0; i < replies.length; i++){
                    var parts = keys[i].split(':');
                    var workerId = parts[parts.length - 1];
                    balances[workerId] = parseInt(replies[i]) || 0

                }
                callback(null, balances);
            });
        },

        //Filter workers under balance threshold for payment
        function(balances, callback){

            var payments = {};

            for (var worker in balances){
                var balance = balances[worker];
                if (balance >= config.payments.minPayment){
                    var remainder = balance % config.payments.denomination;
                    var payout = balance - remainder;
                    if (payout < 0) continue;
                    payments[worker] = payout;
                }
            }

            if (Object.keys(payments).length === 0){
                log('info', logSystem, 'No workers\' balances reached the minimum payment threshold');
                callback(true);
                return;
            }

            var transferCommands = [];
            var addresses = 0;
            var commandAmount = 0;
            var commandIndex = 0;
			
            for (var worker in payments) {
                var amount = parseInt(payments[worker]);
				if(config.payments.maxTransactionAmount && amount + commandAmount > config.payments.maxTransactionAmount) {
		            amount = config.payments.maxTransactionAmount - commandAmount;
	            }
				
				if(!transferCommands[commandIndex]) {
					transferCommands[commandIndex] = {
						redis: [],
                        amount: 0,
                        tx: {
                            binary_transaction: ""
                        },
                        hash: "",
                        mixin: 0,
                        fee: 0,
                        unlock_time: 0,
                        created: false,
                        sent: false,
                        rpc: {
                            transaction:
                                {
                                    anonymity: 1,
                                    transfers: [],
                                },
                            
                            optimization: "minimal",
                            spend_addresses: [config.poolServer.poolAddress],
                            change_address: config.poolServer.poolAddress
							//destinations: [],
							//fee: config.payments.transferFee,
							//mixin: config.payments.mixin,
							//unlock_time: 0
						}
					};
				}



                transferCommands[commandIndex].rpc.transaction.transfers.push({ amount: amount, address: worker });
                transferCommands[commandIndex].redis.push(['hincrby', config.coin + ':workers:' + worker, 'balance', -amount]);
                transferCommands[commandIndex].redis.push(['hincrby', config.coin + ':workers:' + worker, 'paid', amount]);
                transferCommands[commandIndex].amount += amount;

                addresses++;
				commandAmount += amount;
                if (addresses >= config.payments.maxAddresses || ( config.payments.maxTransactionAmount && commandAmount >= config.payments.maxTransactionAmount)) {
                    commandIndex++;
                    addresses = 0;
					commandAmount = 0;
                }
            }

            var timeOffset = 0;

            async.filter(transferCommands, function (transferCmd, cback) {
                async.waterfall([
                    function (callback) {
                        createTransaction(transferCmd, function (error, result) {
                            if (error) {
                                cback(error);
                                return;
                            }

                            callback(error, result);
                        })
                    },
                    function (command, callback) {
                        sendTransaction(command, function (error, result) {
                            if (error) {
                                cback(false);
                                return;
                            }

                            callback(error, result)
                        })
                    },
                    function (command, callback) {

                        if (!command.sent) {
                            cback(false);
                            return;
                        }

                        var now = (timeOffset++) + Date.now() / 1000 | 0;

                        command.redis.push(['zadd', config.coin + ':payments:all', now, [
                            command.hash,
                            command.amount,
                            command.fee,
                            command.mixin,
                            Object.keys(command.rpc.transaction.transfers).length
                        ].join(':')]);

                        for (var i = 0; i < command.rpc.transaction.transfers.length; i++) {
                            var destination = command.rpc.transaction.transfers[i];
                            command.redis.push(['zadd', config.coin + ':payments:' + destination.address, now, [
                                command.hash,
                                destination.amount,
                                command.fee,
                                command.mixin
                            ].join(':')]);
                        }

                        log('info', logSystem, 'Payments sent via wallet daemon \n %j', command.rpc.transaction.transfers);
                        redisClient.multi(command.redis).exec(function (error, replies) {
                            if (error) {
                                log('error', logSystem, 'Super critical error! Payments sent yet failing to update balance in redis, double payouts likely to happen %j', [error]);
                                log('error', logSystem, 'Double payments likely to be sent to %j', command.rpc.destinations);
                                cback(false);
                                return;
                            }

                            cback(true);
                            return;
                        });
                    }

                ], function (error, result) {
                    if (error) {
                        log('info', logSystem, 'TX --> %j', [error]);
                        cback(false);
                        return;
                    }

                    cback(true);
                });
            }, function (succeeded) {
                var failedAmount = transferCommands.length - succeeded.length;
                log('info', logSystem, 'TX sent: %d, %d failed', [succeeded.length, failedAmount]);
                callback(null);
            });
        }
    ], function(error, result){
        setTimeout(runInterval, config.payments.interval * 1000);
    });
}

function createTransaction(command, callback) {
    apiInterfaces.rpcWallet('create_transaction', command.rpc, function (error, result) {
        if (error) {
            log('error', logSystem, 'Error with create_transaction %j', [error]);
            log('error', logSystem, 'TX: %j', command.rpc.transaction.transfers);
        }

        command.tx.binary_transaction = result.binary_transaction;
        command.mixin = result.transaction.anonymity;
        command.fee = result.transaction.fee;
        command.hash = result.transaction.hash;
        command.created = true;

        callback(error, command)
    })
}

function sendTransaction(command, callback) {
    if (!command.created) {
        callback(true, command);
    }

    //apiInterfaces.rpcWallet('get_status', command.tx, function (error, result) {
    apiInterfaces.rpcWallet('send_transaction', command.tx, function (error, result) {
        if (error) {
            log('error', logSystem, 'Error with send_transaction RPC request to wallet daemon %j', [error]);
            log('error', logSystem, 'Payments failed to send to %j', cmd.rpc.transaction.transfers);
            callback(error);
            return;
        }

        if (result.send_result != "broadcast") {
            log('error', logSystem, 'Error with send_transaction RPC request to wallet daemon %j', [result]);
            log('error', logSystem, 'Payments failed to send to %j', cmd.rpc.transaction.transfers);
            callback(result);
            return;
        }

        command.sent = true;

        callback(error, command);
    });
}

runInterval();
