
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

    isSuggestion = (event) ->
        !!event.metadata.date

    isEventBefore = (event, date) ->
        if isSuggestion event
            return false
        return new Date(event.date) - date <= 0


    # A content helper to get all events, ordered by date.
    getRawEvents = (contents) ->
        # helper that returns a list of events found in *contents*
        # note that each event is assumed to be a simple textfile or a directory
        if contents[options.contents]._.directories?.length
                events = contents[options.contents]._.directories.map (item) -> item.index
        else
                events = contents[options.contents]._.pages
        return events

    # A content helper to get all events, ordered by date.
    getEvents = (contents) ->
        events = getRawEvents contents
        events = events.filter (a) -> a.metadata.date
        events.sort (a, b) -> b.date - a.date

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

    getSuggestions = (contents) ->
        events = getRawEvents contents
        events.filter (a) -> !a.metadata.date

    ### Add some helpers to access data ###

    env.helpers.getEvents = getEvents
    env.helpers.getUpcomingEvents = getUpcomingEvents
    env.helpers.getPastEvents = getPastEvents
    env.helpers.getSuggestions = getSuggestions
    env.helpers.isEventBefore = isEventBefore
    env.helpers.isSuggestion = isSuggestion

    # tell plugin manager we are done
    callback()
