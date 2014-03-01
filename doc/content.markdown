Adding content
==============

Content is generated using wintersmith.

Javascript AMD build is set and Sass with foundation is available. See the
[build documentation](grunt-build.md) to learn more.

To add a **content file** all you need to do is to create a file in the
`contents` directory. This file MUST define following metadata:

``` markdown
---
template: page.hbs  # This is the template file to use, located in `templates`
                    # directory.
                    # If no template is provided, file is not rendered
                    # but is still available in the content tree.
title: Example      # This is the title, available in the template
---

Some content goes here
```

Some special contents are available too, such as locations and events.

### Events

Events are located in `contents/events/` directory.

> **It is very important that every event is defined in an `.md` file.**
>
> This behavior is expected from events helpers.

An event file represents an event organized or publicized by ClermontJS.

Every event MUST define a date, otherwise it is considered as a **suggestion**.

``` markdown
---
template: event.hbs             # This is the template file to use.
title: Example Event            # This is the event title.
date: 2014-03-11 19:00          # The event date and time.
location: location_id           # The event location id or name
speaker: speaker_id             # the speaker id.
eventbrite: false               # Eventbrite event id or false.
slides: false                   # A link to slides.
video: false                    # the youtube video id or false.
---

Some content goes here
```

Related helpers:

* `eventClass`: add event class (upcoming, past).
* `video`: Display embedded event video.
* `slides`: Display link to slides.

* `ifFutureEvent`: Block helper to detect if an event is planned in future.
* `ifPastEvent`: Block helper to detect if an event already happened.

* `eventList`: Block helper to display a list of events.
* `pastEvents`: Block helper to display a list of previous events.
* `futureEvents`: Block helper to display a list of previous events.

### Suggestions

Suggestions are unplanned events and are stored in `contents/events/` directory
so URL does not change when a suggestion is promoted to an event.

> **It is very important that every suggestion is defined in an `.md` file.**
>
> This behavior is expected from suggestions helpers.

``` markdown
---
template: suggestion.hbs        # This is the template file to use.
title: Example Event            # This is the event title.
date: null                      # The event date and time eg: 2014-03-11 19:00.
location: null                  # The event location id or name
speaker: speaker_id             # the speaker id.
eventbrite: false               # Eventbrite event id or false.
slides: false                   # A link to slides.
video: false                    # the youtube video id or false.
---

Some content goes here
```

### Speaker

Speakers are stored in `contents/speakers/` directory.

> **It is very important that every speaker is defined in an `.md` file.**
>
> This behavior is expected from speaker helpers.

``` markdown
---
name: John Doe  # The speaker display name
url:            # The speaker url page
---

You can add a description.
```

Up to now, there is no speaker template.

Related helpers:

* speaker: display a speaker link from an event.


### Location

Locations are stored in the `contents/locations/` direcory.

> **It is very important that every location is defined in an `.md` file.**
>
> This behavior is expected from location helpers.


``` markdown
---
name:   John Doe    # The location display name
prefix: à           # location prefix.
url:    "http://clermont.supinfo.com/"
address: "37 rue Gonod, 63000 Clermont-Ferrand"
---

You can add a description.
```

Up to now, there is no location template.

Related helpers:

* `location`: writes down location link form an event with prefix (`à supinfo`).
* `map`: writes down a map from an address.
