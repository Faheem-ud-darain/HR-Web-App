// Delcargo HR Tracker — Full Desktop Monitor Screen Capture Handler

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const statusMsg = document.getElementById('statusMsg');

  startBtn.addEventListener('click', requestDesktopCapture);
  requestDesktopCapture();

  function requestDesktopCapture() {
    startBtn.disabled = true;
    startBtn.textContent = 'Awaiting Screen Selection...';
    statusMsg.style.display = 'block';
    statusMsg.textContent = 'Please select "Entire Screen" in the popup prompt...';

    if (chrome.desktopCapture && chrome.desktopCapture.chooseDesktopMedia) {
      chrome.desktopCapture.chooseDesktopMedia(['screen'], async (streamId) => {
        if (!streamId) {
          showError('Screen selection was cancelled. Click button to try again.');
          return;
        }
        await initializeStreamWithId(streamId);
      });
    } else {
      navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: false
      }).then(async (stream) => {
        await handleLiveStream(stream);
      }).catch((err) => {
        showError(err.message || 'Screen selection failed');
      });
    }
  }

  async function initializeStreamWithId(streamId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: streamId
          }
        }
      });
      await handleLiveStream(stream);
    } catch (err) {
      showError(err.message || 'Stream initialization error');
    }
  }

  async function handleLiveStream(stream) {
    try {
      const video = document.getElementById('captureVideo');
      video.srcObject = stream;

      video.onloadedmetadata = async () => {
        await video.play();
        const width = video.videoWidth || 1920;
        const height = video.videoHeight || 1080;
        const resStr = `${width}x${height}`;

        statusMsg.style.color = '#34d399';
        statusMsg.textContent = `✓ Full Desktop Capture Active (${resStr})! Closing in 2s...`;

        chrome.storage.local.set({
          desktopStreamGranted: true,
          desktopResolution: resStr
        }, () => {
          setTimeout(() => {
            window.close();
          }, 2000);
        });
      };
    } catch (err) {
      showError(err.message || 'Video stream setup error');
    }
  }

  function showError(msg) {
    statusMsg.style.color = '#fca5a5';
    statusMsg.textContent = msg;
    startBtn.disabled = false;
    startBtn.textContent = 'Select Entire Screen';
  }
});
