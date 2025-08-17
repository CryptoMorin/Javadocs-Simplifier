
function findWebsiteQuery() {
    let docURL = window.location.href
    let params = []

    // Filter out the website origin "xxx.github.io"
    docURL = docURL.replace(window.location.origin, '');

    // If /#/ found then we have URL parameters, grabbing the parameters part of the URL
    if (docURL.indexOf('/#/') > -1) {
        docURL = docURL.split('/#/')[1];
        if (docURL != '') {

            // omit the last forward slash if exist
            if (docURL[docURL.length - 1] == '/') {
                docURL = docURL.substring(0, docURL.length - 1);
            }

            // split the URL final string o get an object with all params 
            params = docURL.split('/');
            console.log(params);
        }
    } else {
        console.log('No URL parameters found');
    }
}

async function simplifyEnumJavadocs(url) {
    console.log(`Downloading javadocs page ${url}...`)
    const htmlFile = await fetch(url).then(response => response.text())

    console.log('Parsing the downloaded javadocs...')
    const parser = new DOMParser();
    const html = parser.parseFromString(txt, 'text/html');

    html.querySelector('.method-summary').remove()
    return html
}

function replacePage(html) {
    console.log('Replacing page...')
    document.querySelector('html').innerHTML = html;
}

const html = await simplifyEnumJavadocs('https://hub.spigotmc.org/javadocs/bukkit/org/bukkit/inventory/meta/trim/TrimPattern.html')
replacePage(html)
console.log('Enum javadocs loaded.')