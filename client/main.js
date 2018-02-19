import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { HTTP } from 'meteor/http';
import { moment } from 'meteor/momentjs:moment';
import { Session } from 'meteor/session';

import './main.html';

const TOTAL_TTK = 10000;

const historyCoins = {
	dates: null,
	ttk: {
		usd: null,
		btc: null
	},
	btc: null,
	eth: null,
	xrp: null
};

// Round any value as parameter
function round(value, decimals) {
  return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
}

// It calculates de token price depending of BTC,ETH and XRP values
const getTokenUSDPrice = function (btcUsd, ethUsd, xrpUsd) {
	return (5*btcUsd + 100*ethUsd + 10000*xrpUsd)/TOTAL_TTK;
};

const getTokenBTCPrice = function (btcUsd, tkkUsd) {
	return tkkUsd/btcUsd;
};

// It simply creates an object to insert in reactive vars
const buildCoinInfo = function (name, fullname, usdPrice, date) {
	return { name, fullname, usdPrice, date };
}

// Values from last 365 days of TTK
const getTokenUSDHistory = function (btcHistory, ethHistory, xrpHistory) {
	const tokenUSDHistory = btcHistory.map(function (btcPrice, index) {
		return getTokenUSDPrice(btcPrice, ethHistory[index], xrpHistory[index]);
	});
	return tokenUSDHistory;
};

const getTokenBTCHistory = function (ttkHistory, btcHistory) {
	const tokenBTCHistory = btcHistory.map(function (btcPrice, index) {
		return getTokenBTCPrice(btcPrice, ttkHistory[index]);
	});
	return tokenBTCHistory;
};

// Initiates the first info to show to the client
const initPrimaryCoins = function (instance) {
	let btcInit = false;
	let ethInit = false;
	let xrpInit = false;
	function allInit() {
		return btcInit && ethInit && xrpInit;
	}
	HTTP.call('get', 'http://www.coincap.io/page/BTC', function (error, result) {
		if (error) console.log(error)
		if (result) {
			btcInit = true;
			instance.BTC.set(buildCoinInfo(result.data.short, result.data.long, result.data.usdPrice, result.data.time));
			if (allInit()) {
				Session.set('allCoinsInit', true);
			}
		}
	});
	HTTP.call('get', 'http://www.coincap.io/page/ETH', function (error, result) {
		if (result) {
			ethInit = true;
			instance.ETH.set(buildCoinInfo(result.data.short, result.data.long, result.data.usdPrice, result.data.time));
			if (allInit()) {
				Session.set('allCoinsInit', true);
			}
		}
	});
	HTTP.call('get', 'http://www.coincap.io/page/XRP', function (error, result) {
		if (result) {
			xrpInit = true;
			instance.XRP.set(buildCoinInfo(result.data.short, result.data.long, result.data.usdPrice, result.data.time));
			if (allInit()) {
				Session.set('allCoinsInit', true);
			}
		}
	});
}
// Gets the historic info of BTC, ETH, and XRP
const initHistoryPrimaryCoins = function (callback) {
	let btcInit = false;
	let ethInit = false;
	let xrpInit = false;
	function allInit() {
		return btcInit && ethInit && xrpInit;
	}

	// Las fechas son las mismas para todas las monedas
	const pricesDates = [];

	const pricesBTCPrice = [];
	const pricesETHPrice = [];
	const pricesXRPPrice = [];
	
	HTTP.call('get', 'http://www.coincap.io/history/365day/BTC', function (error, result) {
		if (result) {
			const datesAndPrices = result.data.price;
			
			datesAndPrices.forEach(function (datePrice) {
				pricesDates.push(datePrice[0]);
				pricesBTCPrice.push(datePrice[1]);
			});
			btcInit = true;
			if (allInit()) {
				const coinsHistory = { 
					dates: pricesDates, 
					btcPrices: pricesBTCPrice,
					ethPrices: pricesETHPrice,
					xrpPrices: pricesXRPPrice
				};
				callback(error, coinsHistory);
			}
		}
	});
	HTTP.call('get', 'http://www.coincap.io/history/365day/ETH', function (error, result) {
		if (result) {
			const datesAndPrices = result.data.price;
			datesAndPrices.forEach(function (datePrice) {
				pricesETHPrice.push(datePrice[1]);
			});
			ethInit = true;
			if (allInit()) {
				const coinsHistory = { 
					dates: pricesDates, 
					btcPrices: pricesBTCPrice,
					ethPrices: pricesETHPrice,
					xrpPrices: pricesXRPPrice
				};
				callback(error, coinsHistory);
			}
		}
	});
	HTTP.call('get', 'http://www.coincap.io/history/365day/XRP', function (error, result) {
		if (result) {
			const datesAndPrices = result.data.price;
			datesAndPrices.forEach(function (datePrice) {
				pricesXRPPrice.push(datePrice[1]);
			});
			xrpInit = true;
			if (allInit()) {
				const coinsHistory = { 
					dates: pricesDates, 
					btcPrices: pricesBTCPrice,
					ethPrices: pricesETHPrice,
					xrpPrices: pricesXRPPrice
				};
				callback(error, coinsHistory);
			}
		}
	});
}
// Builds the line chart
function loadGraph(elementId, dates, prices1, prices2) {
	console.log('CARGA GRAFICO')
	const datesCopy = dates.slice();
	const prices1copy = prices1.slice();
	
	datesCopy.unshift('dates');
	prices1copy.unshift('USD');
	const columns = [datesCopy, prices1copy];
	if (prices2) {
		const prices2Copy = prices2.slice();
		prices2Copy.unshift('BTC');
		columns.push(prices2Copy);
	}
	 
	const chart = c3.generate({
		bindto: elementId,
		data: {
			x: 'dates',
			columns: columns
		},
		axis: {
			x: {
				type : 'timeseries',
				tick: {
					fit: true,
					format: '%d-%m-%Y',
					culling: {
						max: 4 // the number of tick texts will be adjusted to less than this value
					}
				}
			}
		},
		point: {
			show: false   
		}
	});
}

Template.detail.onCreated(function () {

	Session.set('allCoinsInit', false);

	// Socket connection
	const io = require('socket.io-client');
	const socket = io.connect('http://socket.coincap.io');
	// Reactive vars
	this.BTC = new ReactiveVar();
	this.ETH = new ReactiveVar();
	this.XRP = new ReactiveVar();

	this.TTK_USD = new ReactiveVar(null);
	this.TTK_BTC = new ReactiveVar(null);
	// get First Info
	initPrimaryCoins(this);

	// Get history values
	initHistoryPrimaryCoins(function (error, coinsHistory) {
		if (!error) {
			const ttkUSDHistory = getTokenUSDHistory(coinsHistory.btcPrices, coinsHistory.ethPrices, coinsHistory.xrpPrices);
			const ttkBTCHistory = getTokenBTCHistory(ttkUSDHistory, coinsHistory.btcPrices);
			historyCoins.dates = coinsHistory.dates;
			historyCoins.ttk.usd = ttkUSDHistory;
			historyCoins.ttk.btc = ttkBTCHistory;
			historyCoins.btc = coinsHistory.btcPrices;
			historyCoins.eth = coinsHistory.ethPrices;
			historyCoins.xrp = coinsHistory.xrpPrices;
		}
	});
	
	

	const instance = this;
	socket.on('trades', (data) => {
		const coinName = data.message.coin;
		const msg = data.message.msg;
		// Differ from BTC,ETH and XRP
		switch (coinName) {
			case 'BTC':
				instance.BTC.set(buildCoinInfo(msg.short, msg.long, msg.price, msg.time));
				break;
			case 'ETH': 
				instance.ETH.set(buildCoinInfo(msg.short, msg.long, msg.price, msg.time));
				break;
			case 'XRP':
				instance.XRP.set(buildCoinInfo(msg.short, msg.long, msg.price, msg.time));
				break;
		}
	});

	this.autorun( () => {
		// Any change on the BTC,ETH and XRP reactive vars, launch this code
		if (Session.get('allCoinsInit')) {
			const btcUsd = instance.BTC.get().usdPrice;
			const ethUsd = instance.ETH.get().usdPrice;
			const xrpUsd = instance.XRP.get().usdPrice;	

			const tokenUSDPrice = getTokenUSDPrice(btcUsd, ethUsd, xrpUsd);
			instance.TTK_USD.set(tokenUSDPrice);
			const tokenBTCPrice = getTokenBTCPrice(btcUsd, tokenUSDPrice);
			instance.TTK_BTC.set(tokenBTCPrice);
		}
		
	});
});


Template.detail.helpers({
	allCoins: function () {
		return [Template.instance().BTC.get(), Template.instance().ETH.get(), Template.instance().XRP.get()];
	},
	longDate: function (date) {
		return moment(date).format('MMMM Do YYYY, h:mm:ss a');
	},
	round: function (stringPrice) {
		const floatPrice = parseFloat(stringPrice);
		if (!floatPrice) return;
		return round(floatPrice, 4);
	},
	coinsReady: function () {
		return Session.get('allCoinsInit');
	},
	tokenUSDPrice: function () {
		return Template.instance().TTK_USD.get();
	},
	tokenBTCPrice: function () {
		return Template.instance().TTK_BTC.get();
	},
	tkkSupply: function () {
		return TOTAL_TTK;
	}
}); 

Template.detail.events({
	'click #ttkRow': function (event, instance) {
		$('.hid.ttkRow').toggle();
		const graph = $(event.target).closest('tbody').find('svg');
		// If chart is already created, doesnt create it again
		if (graph.length !== 0) return;
		loadGraph('#ttkChart', historyCoins.dates, historyCoins.ttk.usd, historyCoins.ttk.btc);
	},
	'click .coinRow': function (event, instance) {
		const idRow = $(event.target).closest('tr').attr('id');
		$('.hid.' + idRow).toggle();
		const graph = $(event.target).closest('tr').siblings('tr.' + idRow).find('svg');
		// If chart is already created, doesnt create it again
		if (graph.length !== 0) return;
		let graphHistory;
		switch (idRow) {
			case '0':
				// BTC
				graphHistory = historyCoins.btc;
				break;
			case '1':
				// ETH
				graphHistory = historyCoins.eth;
				break;
			case '2':
				// XRP
				graphHistory = historyCoins.xrp;
				break;
		}
		loadGraph('#chart' + idRow, historyCoins.dates, graphHistory);
	}
});