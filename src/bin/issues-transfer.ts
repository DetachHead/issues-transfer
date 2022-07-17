#!/usr/bin/env node
import { IssuesTransfer } from '../index'
import minimist from 'minimist'
import 'source-map-support/register'

const argv = minimist(process.argv.slice(2))

;(async () => {
    const issuesTransfer = new IssuesTransfer(argv)
    await issuesTransfer.run()
})()
