#!/usr/bin/env bash

# This is the project root.
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
# This is where build pages are located.
# default is public.
PUBLISH_DIRECTORY="public"
# The remote where to publish build pages.
PUBLISH_REMOTE="origin"
# The branch tracking published pages
PUBLISH_BRANCH="master"
# the development branch
MAIN_BRANCH="sources"


# Log a message.
function log {
    echo -e " \033[32m*\033[0m ${1}"
}
# write an error message.
function error {
    echo -e "\033[31m${1}\033[0m"
}
# write an info message.
function info {
    echo -e "\033[34m info\033[0m ${1}"
}

function show_error {
    echo $?
    error "An error occured. read output to learn more."
    exit 1;
}

function release {
    log "Will now build pages"
    CMD="${DIR}/node_modules/.bin/grunt release"
    $CMD || show_error
}

function publish_pages {
    log "Will now publish pages"
    cd "${DIR}/${PUBLISH_DIRECTORY}"
    CHANGES=`git status -s | wc -l`

    if [ $CHANGES = 0 ]
    then
        info "Pages branche is already up to date"
        return 0
    fi

    (git add -A . && \
    git commit -m "Latest release" && \
    git push "${PUBLISH_REMOTE}" "${PUBLISH_BRANCH}") || show_error

    cd ${DIR}

    return 0
}

function publish_sources {
    log "Will now publish sources with updated submodule"
    cd "${DIR}"
    CHANGES=`git status public -s | wc -l`

    if [ $CHANGES = 0 ]
    then
        info "Sources repository is already up to date"
        return 0
    fi
    git commit public -m "Latest release"
    git push "${PUBLISH_REMOTE}" "${MAIN_BRANCH}"
}


release && publish_pages && publish_sources && log "Everything went fine."
