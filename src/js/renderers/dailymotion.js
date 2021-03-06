'use strict';

import window from 'global/window';
import document from 'global/document';
import mejs from '../core/mejs';
import {renderer} from '../core/renderer';
import {createEvent, addEvent} from '../utils/dom';
import {typeChecks} from '../utils/media';

/**
 * DailyMotion renderer
 *
 * Uses <iframe> approach and uses DailyMotion API to manipulate it.
 * @see https://developer.dailymotion.com/player
 *
 */
const DailyMotionApi = {
	/**
	 * @type {Boolean}
	 */
	isSDKStarted: false,
	/**
	 * @type {Boolean}
	 */
	isSDKLoaded: false,
	/**
	 * @type {Array}
	 */
	iframeQueue: [],

	/**
	 * Create a queue to prepare the creation of <iframe>
	 *
	 * @param {Object} settings - an object with settings needed to create <iframe>
	 */
	enqueueIframe: (settings) => {

		if (DailyMotionApi.isLoaded) {
			DailyMotionApi.createIframe(settings);
		} else {
			DailyMotionApi.loadIframeApi();
			DailyMotionApi.iframeQueue.push(settings);
		}
	},

	/**
	 * Load DailyMotion API script on the header of the document
	 *
	 */
	loadIframeApi: () => {
		if (!DailyMotionApi.isSDKStarted) {
			let e = document.createElement('script');
			e.async = true;
			e.src = '//api.dmcdn.net/all.js';
			let s = document.getElementsByTagName('script')[0];
			s.parentNode.insertBefore(e, s);
			DailyMotionApi.isSDKStarted = true;
		}
	},

	/**
	 * Process queue of DailyMotion <iframe> element creation
	 *
	 */
	apiReady: () => {

		DailyMotionApi.isLoaded = true;
		DailyMotionApi.isSDKLoaded = true;

		while (DailyMotionApi.iframeQueue.length > 0) {
			let settings = DailyMotionApi.iframeQueue.pop();
			DailyMotionApi.createIframe(settings);
		}
	},

	/**
	 * Create a new instance of DailyMotion API player and trigger a custom event to initialize it
	 *
	 * @param {Object} settings - an object with settings needed to create <iframe>
	 */
	createIframe: (settings) => {

		let
			player = DM.player(settings.container, {
				height: settings.height || '100%',
				width: settings.width || '100%',
				video: settings.videoId,
				params: Object.assign({api: true}, settings.params),
				origin: location.host
			});

		player.addEventListener('apiready', () => {
			window['__ready__' + settings.id](player, {paused: true, ended: false});
		});
	},

	/**
	 * Extract ID from DailyMotion's URL to be loaded through API
	 * Valid URL format(s):
	 * - http://www.dailymotion.com/embed/video/x35yawy
	 * - http://dai.ly/x35yawy
	 *
	 * @param {String} url
	 * @return {String}
	 */
	getDailyMotionId: (url) => {
		let
			parts = url.split('/'),
			lastPart = parts[parts.length - 1],
			dashParts = lastPart.split('_')
		;

		return dashParts[0];
	}
};

const DailyMotionIframeRenderer = {
	name: 'dailymotion_iframe',

	options: {
		prefix: 'dailymotion_iframe',

		dailymotion: {
			width: '100%',
			height: '100%',
			params: {
				autoplay: false,
				chromeless: 1,
				info: 0,
				logo: 0,
				related: 0
			}
		}
	},

	/**
	 * Determine if a specific element type can be played with this render
	 *
	 * @param {String} type
	 * @return {Boolean}
	 */
	canPlayType: (type) => ['video/dailymotion', 'video/x-dailymotion'].includes(type),

	/**
	 * Create the player instance and add all native events/methods/properties as possible
	 *
	 * @param {MediaElement} mediaElement Instance of mejs.MediaElement already created
	 * @param {Object} options All the player configuration options passed through constructor
	 * @param {Object[]} mediaFiles List of sources with format: {src: url, type: x/y-z}
	 * @return {Object}
	 */
	create: (mediaElement, options, mediaFiles) => {

		let dm = {};

		dm.options = options;
		dm.id = mediaElement.id + '_' + options.prefix;
		dm.mediaElement = mediaElement;

		let
			apiStack = [],
			dmPlayerReady = false,
			dmPlayer = null,
			dmIframe = null,
			events,
			i,
			il
		;

		// wrappers for get/set
		let
			props = mejs.html5media.properties,
			assignGettersSetters = (propName) => {

				// add to flash state that we will store

				const capName = `${propName.substring(0, 1).toUpperCase()}${propName.substring(1)}`;

				dm[`get${capName}`] = () => {
					if (dmPlayer !== null) {
						let value = null;

						// figure out how to get dm dta here
						switch (propName) {
							case 'currentTime':
								return dmPlayer.currentTime;

							case 'duration':
								return isNaN(dmPlayer.duration) ? 0 : dmPlayer.duration;

							case 'volume':
								return dmPlayer.volume;

							case 'paused':
								return dmPlayer.paused;

							case 'ended':
								return dmPlayer.ended;

							case 'muted':
								return dmPlayer.muted;

							case 'buffered':
								let percentLoaded = dmPlayer.bufferedTime,
									duration = dmPlayer.duration;
								return {
									start: () => {
										return 0;
									},
									end: () => {
										return percentLoaded / duration;
									},
									length: 1
								};
							case 'src':
								return mediaElement.originalNode.getAttribute('src');
						}

						return value;
					} else {
						return null;
					}
				};

				dm[`set${capName}`] = (value) => {
					if (dmPlayer !== null) {

						switch (propName) {

							case 'src':
								let url = typeof value === 'string' ? value : value[0].src;

								dmPlayer.load(DailyMotionApi.getDailyMotionId(url));
								break;

							case 'currentTime':
								dmPlayer.seek(value);
								break;

							case 'muted':
								if (value) {
									dmPlayer.setMuted(true);
								} else {
									dmPlayer.setMuted(false);
								}
								setTimeout(() => {
									let event = createEvent('volumechange', dm);
									mediaElement.dispatchEvent(event);
								}, 50);
								break;

							case 'volume':
								dmPlayer.setVolume(value);
								setTimeout(() => {
									let event = createEvent('volumechange', dm);
									mediaElement.dispatchEvent(event);
								}, 50);
								break;

							default:
								console.log('dm ' + dm.id, propName, 'UNSUPPORTED property');
						}

					} else {
						// store for after "READY" event fires
						apiStack.push({type: 'set', propName: propName, value: value});
					}
				};

			}
		;

		for (i = 0, il = props.length; i < il; i++) {
			assignGettersSetters(props[i]);
		}

		// add wrappers for native methods
		let
			methods = mejs.html5media.methods,
			assignMethods = (methodName) => {

				// run the method on the native HTMLMediaElement
				dm[methodName] = () => {
					if (dmPlayer !== null) {

						// DO method
						switch (methodName) {
							case 'play':
								return dmPlayer.play();
							case 'pause':
								return dmPlayer.pause();
							case 'load':
								return null;

						}

					} else {
						apiStack.push({type: 'call', methodName: methodName});
					}
				};

			}
		;

		for (i = 0, il = methods.length; i < il; i++) {
			assignMethods(methods[i]);
		}

		// Initial method to register all DailyMotion events when initializing <iframe>
		window['__ready__' + dm.id] = (_dmPlayer) => {

			dmPlayerReady = true;
			mediaElement.dmPlayer = dmPlayer = _dmPlayer;

			// do call stack
			if (apiStack.length) {
				for (i = 0, il = apiStack.length; i < il; i++) {

					let stackItem = apiStack[i];

					if (stackItem.type === 'set') {
						let
							propName = stackItem.propName,
							capName = `${propName.substring(0, 1).toUpperCase()}${propName.substring(1)}`
							;

						dm[`set${capName}`](stackItem.value);

					} else if (stackItem.type === 'call') {
						dm[stackItem.methodName]();
					}
				}
			}

			dmIframe = document.getElementById(dm.id);

			// a few more events
			events = ['mouseover', 'mouseout'];
			let assignEvent = (e) => {
				let event = createEvent(e.type, dm);
				mediaElement.dispatchEvent(event);
			};

			for (let j in events) {
				addEvent(dmIframe, events[j], assignEvent);
			}

			// BUBBLE EVENTS up
			events = mejs.html5media.events;
			events = events.concat(['click', 'mouseover', 'mouseout']);
			let assignNativeEvents = (eventName) => {

				// Deprecated event; not consider it
				if (eventName !== 'ended') {

					dmPlayer.addEventListener(eventName, (e) => {
						let event = createEvent(e.type, dmPlayer);
						mediaElement.dispatchEvent(event);
					});
				}

			};

			for (i = 0, il = events.length; i < il; i++) {
				assignNativeEvents(events[i]);
			}

			// Custom DailyMotion events
			dmPlayer.addEventListener('ad_start', () => {
				let event = createEvent('play', dmPlayer);
				mediaElement.dispatchEvent(event);

				event = createEvent('progress', dmPlayer);
				mediaElement.dispatchEvent(event);

				event = createEvent('timeupdate', dmPlayer);
				mediaElement.dispatchEvent(event);
			});
			dmPlayer.addEventListener('ad_timeupdate', () => {
				let event = createEvent('timeupdate', dmPlayer);
				mediaElement.dispatchEvent(event);
			});
			dmPlayer.addEventListener('ad_pause', () => {
				let event = createEvent('pause', dmPlayer);
				mediaElement.dispatchEvent(event);
			});
			dmPlayer.addEventListener('ad_end', () => {
				let event = createEvent('ended', dmPlayer);
				mediaElement.dispatchEvent(event);
			});
			dmPlayer.addEventListener('video_start', () => {
				let event = createEvent('play', dmPlayer);
				mediaElement.dispatchEvent(event);

				event = createEvent('timeupdate', dmPlayer);
				mediaElement.dispatchEvent(event);
			});
			dmPlayer.addEventListener('video_end', () => {
				let event = createEvent('ended', dmPlayer);
				mediaElement.dispatchEvent(event);
			});
			dmPlayer.addEventListener('progress', () => {
				let event = createEvent('timeupdate', dmPlayer);
				mediaElement.dispatchEvent(event);
			});
			dmPlayer.addEventListener('durationchange', () => {
				let event = createEvent('timeupdate', dmPlayer);
				mediaElement.dispatchEvent(event);
			});


			// give initial events
			let initEvents = ['rendererready', 'loadeddata', 'loadedmetadata', 'canplay'];

			for (i = 0, il = initEvents.length; i < il; i++) {
				let event = createEvent(initEvents[i], dm);
				mediaElement.dispatchEvent(event);
			}
		};

		let dmContainer = document.createElement('div');
		dmContainer.id = dm.id;
		mediaElement.appendChild(dmContainer);
		if (mediaElement.originalNode) {
			dmContainer.style.width = mediaElement.originalNode.style.width;
			dmContainer.style.height = mediaElement.originalNode.style.height;
		}
		mediaElement.originalNode.style.display = 'none';

		let
			videoId = DailyMotionApi.getDailyMotionId(mediaFiles[0].src),
			dmSettings = Object.assign({
				id: dm.id,
				container: dmContainer,
				videoId: videoId,
				autoplay: !!(mediaElement.originalNode.getAttribute('autoplay'))
			}, dm.options.dailymotion);

		DailyMotionApi.enqueueIframe(dmSettings);

		dm.hide = () => {
			dm.stopInterval();
			dm.pause();
			if (dmIframe) {
				dmIframe.style.display = 'none';
			}
		};
		dm.show = () => {
			if (dmIframe) {
				dmIframe.style.display = '';
			}
		};
		dm.setSize = (width, height) => {
			dmIframe.width = width;
			dmIframe.height = height;
		};
		dm.destroy = () => {
			dmPlayer.destroy();
		};
		dm.interval = null;

		dm.startInterval = () => {
			dm.interval = setInterval(() => {
				DailyMotionApi.sendEvent(dm.id, dmPlayer, 'timeupdate', {
					paused: false,
					ended: false
				});
			}, 250);
		};
		dm.stopInterval = () => {
			if (dm.interval) {
				clearInterval(dm.interval);
			}
		};

		return dm;
	}
};


/*
 * Register DailyMotion event globally
 *
 */
typeChecks.push((url) => {
	url = url.toLowerCase();
	return (url.includes('//dailymotion.com') || url.includes('www.dailymotion.com') || url.includes('//dai.ly')) ? 'video/x-dailymotion' : null;
});

window.dmAsyncInit = () => {
	DailyMotionApi.apiReady();
};

renderer.add(DailyMotionIframeRenderer);