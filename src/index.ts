import { lengthIs } from '@detachhead/ts-helpers/dist/utilityFunctions/Array'
import { Octokit } from '@octokit/rest'
import _ from 'lodash'
import { ParsedArgs } from 'minimist'
import prompt from 'prompt'
import { throwIfUndefined } from 'throw-expression'

const sample = 'organization/repo-name'

interface IssuesTransferOpts extends ParsedArgs {
    h?: boolean
    help?: boolean
    t?: string
    token?: string
    from?: string
    to?: string
    'transfer-labels'?: boolean
    'transfer-assignees'?: boolean
    'only-labels'?: string
    'auto-close'?: boolean
    link?: boolean
}

export class IssuesTransfer {
    help: boolean = false
    token?: string
    sourceRepo?: string
    destinationRepo?: string
    transferLabels?: boolean
    transferAssignee?: boolean
    onlyLabels: string | null = null
    autoClose?: boolean
    link?: boolean

    github?: InstanceType<typeof Octokit>

    constructor(opts: IssuesTransferOpts) {
        if (opts.h || opts.help || Object.keys(opts).length === 1) {
            this.help = true
            return
        }

        this.token = throwIfUndefined(
            opts.token ?? opts.t,
            '--token option required (e.g --token=abc123)',
        )
        this.sourceRepo = throwIfUndefined(
            opts.from,
            '--from option required (eg. --from=' + sample + ')',
        )
        this.destinationRepo = throwIfUndefined(
            opts.to,
            '--to option required (eg. --to=' + sample + ')',
        )
        this.transferLabels = opts['transfer-labels'] ?? false
        this.transferAssignee = opts['transfer-assignees'] ?? true
        this.onlyLabels = opts['only-labels'] ?? null
        this.autoClose = opts['auto-close'] ?? false
        this.link = opts['link'] ?? true

        console.log('Beginning transfer of issues')
        console.log('--------------------------Options-----------------------------')
        console.log('Source repository \t\t', this.sourceRepo)
        console.log('Destination repository \t\t', this.destinationRepo)
        console.log('Transfer labels? \t\t', this.transferLabels ? 'Yes' : 'No')
        console.log('Transfer assignee? \t\t', this.transferAssignee ? 'Yes' : 'No')
        if (this.onlyLabels) {
            console.log('Only transfer labelled as \t', this.onlyLabels)
        }
        console.log('-------------------------------------------------------------')

        this.github = new Octokit({
            version: '3.0.0',
            auth: this.token,
        })
    }

    showHelp = (): void => {
        const requiredArgs = ['--token <token>', '--from <user/repo>', '--to <user/repo>']

        const optionalArgs = [
            '\t--transfer-labels\t\t Whether to copy labels with the issue',
            '\t--transfer-assignees\t\t Whether to copy assignees with the issue',
            '\t--auto-close\t\t\t Close source issue after creating new',
            '\t--only-labels <labels,to,copy>\t Only copy issues with particular labels',
        ]

        console.log('\nUsage:\n\nissues-transfer ' + requiredArgs.join(' '))
        console.log('\nAvailable options:\n' + optionalArgs.join('\n'))
        console.log('\n')
    }

    run = async (): Promise<void> => {
        if (this.help) {
            this.showHelp()
            return
        }

        prompt.delimiter = ''
        prompt.message = ''
        prompt.start()

        const question = 'Continue? [Y/n]'

        const result = (await prompt.get([question]))[question]

        if (typeof result !== 'string')
            throw new Error('failed to get result. its type is {typeof result}')
        const answer = result.toLowerCase()
        if (answer === 'n') {
            return
        }

        const sourceRepo = this.getRepo(this.sourceRepo, 'from')

        const sourceOpts = {
            ...sourceRepo,
            state: 'open',
            ...(this.onlyLabels ? { labels: this.onlyLabels } : undefined),
        } as const

        const github = throwIfUndefined(this.github)

        let issues
        try {
            issues = await github.issues.listForRepo(sourceOpts)
        } catch (err) {
            console.error('Failed to lookup issues')
            throw err
        }

        const destinationRepo = this.getRepo(this.destinationRepo, 'to')

        const results = await Promise.all(
            issues.data.map(async (issue) => {
                const boilerplate =
                    this.link === false ? '' : 'Transferred from: ' + issue.html_url + '\r\n\r\n'

                const createOpts = {
                    ...destinationRepo,
                    title: issue.title,
                    body: boilerplate + (issue.body ?? ''),
                    labels: this.transferLabels ? _.map(issue.labels, 'name') : [],
                    ...(this.transferAssignee && issue.assignee
                        ? { assignee: issue.assignee.login }
                        : undefined),
                } as const

                try {
                    return await github.issues.create(createOpts)
                } catch (err) {
                    console.error('Failed to create issue')
                    throw err
                }
            }),
        )
        console.log('Issues transferred \t\t', results.length)
    }

    private getRepo = (
        path: string | undefined,
        fromOrTo: 'from' | 'to',
    ): { owner: string; repo: string } => {
        const source = throwIfUndefined(path).split('/')
        if (!lengthIs(source, 2)) {
            throw new Error(`--${fromOrTo} option must be slash delimited user/repo`)
        }
        return {
            owner: source[0],
            repo: source[1],
        }
    }
}
