const recorders = {};

let client, pc, stream;

function CONNECT_WEBSOCKET() {
	client = new WebSocket(`ws://localhost:${window.location.hash.substring(1)}`, []);
}

async function START_RECORDING({
	index,
	video,
	audio,
	frameSize,
	audioBitsPerSecond,
	videoBitsPerSecond,
	bitsPerSecond,
	mimeType,
	videoConstraints,
	delay,
	audioConstraints,
	tabId,
}) {
	STOP_RECORDING();

	console.log(
		"[PUPPETEER_STREAM] START_RECORDING",
		JSON.stringify({
			index,
			video,
			audio,
			frameSize,
			audioBitsPerSecond,
			videoBitsPerSecond,
			bitsPerSecond,
			mimeType,
			videoConstraints,
			audioConstraints,
			tabId,
		})
	);

	////////// WebRTC /////////////

	client.onmessage = message => {
		const messageWebRTC = JSON.parse(message.data);
		switch (messageWebRTC.type) {
			case "answer":
				handleAnswer(messageWebRTC);
				break;
			case "candidate":
				handleCandidate(messageWebRTC);
				break;
		}
	}

	function createPeerConnection() {
		pc = new RTCPeerConnection();
		pc.onicecandidate = e => {
			const message = {
				type: 'candidate',
				candidate: null,
			};
			if (e.candidate) {
				message.candidate = e.candidate.candidate;
				message.sdpMid = e.candidate.sdpMid;
				message.sdpMLineIndex = e.candidate.sdpMLineIndex;
			}
			client.send(JSON.stringify(message));
		};
		stream.getTracks().forEach(track => pc.addTrack(track, stream));
		pc.oniceconnectionstatechange = function() {
			if(pc.iceConnectionState == 'disconnected') {
				STOP_RECORDING();
			}
		}
	}

	async function makeCall() {
		createPeerConnection();

		const offer = await pc.createOffer();
		const message = { type: 'offer', sdp: offer.sdp }
		client.send(JSON.stringify(message));
		await pc.setLocalDescription(offer);
	}

	async function handleAnswer(answer) {
		if (!pc) {
			console.error('no peerconnection');
			return;
		}
		await pc.setRemoteDescription(answer);
	}

	async function handleCandidate(candidate) {
		if (!pc) {
			console.error('no peerconnection');
			return;
		}
		if (!candidate.candidate) {
			await pc.addIceCandidate(null);
		} else {
			await pc.addIceCandidate(candidate);
		}
	}


	///////// End WebRTC /////////

	await new Promise((resolve) => {
		if (client.readyState === WebSocket.OPEN) resolve();
		client.addEventListener("open", resolve);
	});

	const streamId = await new Promise((resolve, reject) => {
		chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (stream) => {
			if (stream) resolve(stream);
			else reject();
		});
	});

	stream = await navigator.mediaDevices.getUserMedia({
		video: video && {
			...video,
			mandatory: {
				...video?.mandatory,
				chromeMediaSource: "tab",
				chromeMediaSourceId: streamId,
			},
		},
		audio: audio && {
			...audio,
			mandatory: {
				...audio?.mandatory,
				chromeMediaSource: "tab",
				chromeMediaSourceId: streamId,
			},
		},
	});

	makeCall();
}

function STOP_RECORDING() {
	pc?.close()
	stream?.getTracks().forEach(track => track.stop());
	pc = null;
	stream = null;
}
