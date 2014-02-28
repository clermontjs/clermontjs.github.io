
fs = require 'fs'

module.exports = (env, callback) ->
    # *env* is the current wintersmith environment
    # *callback* should be called when the plugin has finished loading

    defaults =
        contents: 'events'
    # assign defaults any option not set in the config file
    options = env.config.events or {}
    for key, value of defaults
        options[key] ?= defaults[key]

    isEventBefore = (event, date) ->
        return new Date(event.date) - date <= 0

    # A content helper to get all events, ordered by date.
    getEvents = (contents) ->
        # helper that returns a list of articles found in *contents*
        # note that each event is assumed to be a simple textfile
        if contents[options.contents]._.directories?.length
                events = contents[options.contents]._.directories.map (item) -> item.index
        else
                events = contents[options.contents]._.pages
        events.sort (a, b) -> b.date - a.date
        return events

    getUpcomingEvents = (contents) ->
        events = getEvents contents
        now = (new Date)
        return events.filter (event) ->
            return !isEventBefore event, now

    getPastEvents = (contents) ->
        events = getEvents contents
        now = new Date
        return events.filter (event) ->
            return isEventBefore event, now

    ### Add some helpers to access data ###

    env.helpers.getEvents = getEvents
    env.helpers.getUpcomingEvents = getUpcomingEvents
    env.helpers.getPastEvents = getPastEvents
    env.helpers.isEventBefore = isEventBefore

    # tell plugin manager we are done
    callback()
