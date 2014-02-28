Grunt build
===========

## Configuration

General configuration is located in `grunt/config.json` file.

This file defines the configuration object passed to `grunt.initConfig`.
All **global values**, including **`multiTasks` options**, are defined in this file.

All values are commented in the config file.

> It is ok to add inline comments in grunt JSON files with this build.

## Options

In `grunt/tasks/options.js` you will find a task loading all json files in the
`grunt/options/` directory.

Note that filename is used as key for your json configuration.

If you define `options` key, it will be merged to all local tasks, but will not
affect tasks outside of this file.

## High level tasks

**grunt dev**: Start development environment.

All launched tasks are defined in the `concurrent:dev` task. Edit it to add
more development tasks.

Please refer to tasks documentation for more information on every available tasks.

**grunt preview**

Build a pre-release and start release like server.
Use it to test before shipping.

**grunt release:fix** Create a new fix release.

Not sure it will remain a grunt task.

**grunt release:minor** Create a new minor release

Not sure it will remain a grunt task.

**grunt release:major** Create a new major release

Not sure it will remain a grunt task.

**grunt** is a shorthand for `dev` task.

**grunt build:release**: Build release code.

Internal task used to build application for release.
This is the only reference for build steps.

## Tasks



## Build the frontend javascript

Just include '<%= config.public.mainjs %>' script in your html and your app
is ready to be served.

In **dev** mode, kernel is concatenated continuously with requirejs and
configuration file so dependencies are lazy loaded.

For **release**, files are combined and compressed to deliver a single file
to your users.

> find out more in `grunt/tasks/app.js` file.


## Bump task

This task creates a release.

* **bump:fix** create a new fix release
* **bump:minor** create a new minor release
* **bump:major** create a new major release

> find out more in `grunt/tasks/bump.js` file.


## Documentation task

This task create the whole documentation by parsing files.

### Grunt tasks

All grunt tasks documentation is generated from task files top comments that
are parsed and combined into `doc/grunt-build.md` file.

### Available tasks

**grunt doc:grunt** create grunt tasks documentation.

> find out more in `grunt/tasks/doc.js` file.


## options task

Load all json files in `directory` and extend configuration.

``` json
"extend-config": {
    "options": {useFilenameAsKey: true},
    "default": {files: ['grunt/options/*.json']}
}
```

All json files in `grunt/options/` are loaded by default, using filename as config key.

For instance if you define `grunt/options/foo.js` with `{"bar": "baz"}`, it
adds the following to your grunt config:

``` json
{
   "foo": {
        "bar": "baz"
   }
}
```


> find out more in `grunt/tasks/options.js` file.


## server task

Using grunt-contrib-express under the hood.
It serves public directory by default.

In **dev** mode it files under /js are served from respectively from
'public/js' and 'src/www'.
Files under /vendors are served from respectively from 'bower_conmponents' and 'public/vendors'.

In **prod**, only `public` directory is served, so you might need to copy
static files during build.

Here is an example copy task:

``` json
{
 "copy": {
     "release-app": {
     "files": {
         "<%= config.public.vendors %>/jquery.js": "<%= config.www.vendors %>/jquery/jquery.js"
     }
 }
}
```

### Available tasks

**serve:dev** start dev server

**serve:release** start prod server


> find out more in `grunt/tasks/serve.js` file.


## Generate static content

Generate a static website using [wintersmith](http://wintersmith.io/).

> find out more in `grunt/tasks/static.js` file.


## Style task

Manage styles. By default sass files available in `<%= config.www.sass %>`
are processed.

* **style:dev** compiles stylesheets files and watch files for change.
* **style:release** compiles stylesheets files and optimize for prodution.

> find out more in `grunt/tasks/style.js` file.


## templates

Use [grunt-contrib-handlebars](https://github.com/gruntjs/grunt-contrib-handlebars)
under the hood, compiles templates for your project.

### Configuration

* `config.www.templates`: where are raw templates stored
* `config.public.templates`: where compiled tempaltes goes.

### Available tasks

**templates:dev** compile templates continuously.

**templates:release** compile templates.


> find out more in `grunt/tasks/templates.js` file.