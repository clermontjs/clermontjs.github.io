#!/usr/bin/env bash
BIN_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
SCRIPTNAME=$(basename "${BASH_SOURCE[0]}")

# initial config
ENVIRONMENT="dev"
COMPRESS="false"
if [ -z "$(which grunt)" ] ;
then
	#use local grunt-cli
    COMMAND="${ROOT_DIR}/node_modules/.bin/grunt"
else
	COMMAND="grunt"
fi

function usage {
    printf "Build frontend assets for <%= appname %>\n"
    printf "\n"
    printf "\t${SCRIPTNAME} [options]\n"
    printf "\n"
    printf "Options\n"
    printf "\t-e --env      : target environment (dev|prod), default: dev\n"
    printf "\t-n --node     : node executable path\n"
    printf "\t-h --help     : show this help\n"
    printf "\n"
}

function parse_options {
    SHORT_OPT="e:n:h"
    LONG_OPT="env:,node:,help"
    # parse arguments
    OPTS=$( getopt -o "$SHORT_OPT" -l "$LONG_OPT" -- "$@" )
    if  [ $? != 0 ]; then
        usage;
        exit 1;
    fi
    eval set -- "$OPTS"

    # read options
    while true ; do
        case "$1" in
            -e|--env) ENVIRONMENT="$2"
                shift 2;;
            -n|--node) PATH="$2:${PATH}"
                shift 2;;
            -h|--help) usage
                exit 0;;
            --) shift
                break;;
        esac
    done
}

function build {
    ${BIN_DIR}/bootstrap.sh
    case "$ENVIRONMENT" in
        dev) echo "dev ${DIR}"
            COMMAND="${COMMAND} dev"
            ;;
        *) echo "prod"
            COMMAND="${COMMAND} release"
            ;;
    esac
    $COMMAND
}

parse_options "$@"
build


