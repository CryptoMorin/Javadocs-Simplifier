* When writing links, you should be careful not to use root `/` because in GitHub, we start in `/Javadocs-Simplifier` not `/`.

* All links in `templates` folder should start with a `./` otherwise a template loading a template will try to resolve the link with `../` (Happens with `header.html` template loading `color-picker.html` styles and scripts.)

* Sometimes elements that are only available in dev builds (local tests) which are not available on publication cause rendering issues. Specifically, elements not being exactly in the right position.