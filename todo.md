* ~~Add a way to download javadoc.jar files from Maven Central, unzip them and read the content.~~
* ~~Add a header on top of simplified javadocs pages with the logo and some useful buttons.~~
* ~~Add a dark theme to simplified javadocs pages. (should be on our header mentioned above)~~

* Add service workers as the first method for handling iframe links (requires HTTPS) before falling back to manual URL redirects.
* Add proper styling support for older javadocs pages.
* Make the dark theme for javadocs more polished. Currently colors aren't really nicely adjusted. Also it would be cool if we could add multiple color themes!
* Conver the project to TypeScript. (Requires setting up GitHub Actions and the Python TCPServer to automatically transpile TypeScripts using `npm`)
* Links inside javadocs are currently not redirected back to us, they go straight to the host (except JARs.)
* Support psuedo-elements for ThemeGenerator. (Note: Use [getComputedStyle(element, pseudoElt)](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle))
* Fix `Flash of unstyled content (FOUC)` issues during javadocs page loads. Perhaps an intermediate loading layout with high z-index?
* Add an auto-complete for the search bar that connects to Maven Central. Does it have an official API or do we have to scrap the html index? (See [Central Index](https://maven.apache.org/repository/central-index.html))
* Find a way to fix issues with ThemeGenerator and `transition` animations causing `getComputedStyle()` to return invalid values during theme switches. (The current workaround still requires 100ms delay, see `header.html`)
* Reloads on JAR Mode javadocs don't go back to the loaded page, they start from the index.html of the jar.
* Themes aren't properly applied to `.member-signature` elements. They stay white.
* `/is_dev` request should be hardcoded for local tests and removed on GitHub Action processing.
* Make the website more responsive in phones. A lot of shit currently breaks.