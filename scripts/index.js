async function reloadServer(locallyOnly) {
    console.log("Reloading...")
    if (!locallyOnly) {
        const answer = await fetch('/reload', { method: 'POST' })
        console.log("Reload answer: ", answer)
    }
    window.location.reload(true) // Ctrl + F5
}

async function addDevControls() {
    let request;
    try {
        request = await fetch('/is_dev', { method: 'GET' })
    } catch (error) {
        return
    }

    if (request.ok) {
        const answer = await request.text()
        if (answer === "yes") {
            console.log("Initiating Dev Controls...")
            const reloadBtn = document.getElementById('reload-button')
            reloadBtn.style.display = 'inline-flex'
            reloadBtn.addEventListener("click", () => reloadServer(true))
        }
    }
}


export const BG_MUSIC = new Audio('./Around-the-Horizon.mp3')
async function playBackgroundMusic() {
    BG_MUSIC.loop = true

    // Unfortunately there is no way for us to actually suppress the 404 error
    // thrown by this. The browser itself will always print these errors.
    try {
        await BG_MUSIC.play()
    } catch (error) {
        // Mostly because user disabled autoplay.
        console.warn("Failed to play audio: ", error)
    }

    const audioButton = document.querySelector('#audio-control')
    const audioButtonImg = audioButton.querySelector('img')
    audioButton.addEventListener("click", () => {
        if (BG_MUSIC.paused) {
            BG_MUSIC.play()
            audioButtonImg.src = 'images/audio.png'
        } else {
            BG_MUSIC.pause()
            audioButtonImg.src = 'images/no-audio.png'
        }
    });
}

export function runModule() {
    addDevControls()
    playBackgroundMusic()
}