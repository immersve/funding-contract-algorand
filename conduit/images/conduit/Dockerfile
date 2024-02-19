FROM golang:1.20-bullseye as builder

ARG repo=algorand/conduit
ARG ref=rel/stable

ADD https://github.com/${repo}/archive/${ref}.tar.gz /tmp/tarball.tar.gz
RUN tar -xzvf /tmp/tarball.tar.gz -C /usr/local/src/
RUN mv /usr/local/src/conduit* /usr/local/src/conduit

WORKDIR /usr/local/src/conduit

RUN make conduit

RUN mv cmd/conduit/conduit /usr/local/bin/conduit

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV CONDUIT_DATA_DIR /data
WORKDIR /data

ENTRYPOINT conduit
