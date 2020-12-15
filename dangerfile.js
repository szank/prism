const { markdown } = require('danger');
const fs = require('fs').promises;
const gzipSize = require('gzip-size');
const git = require('simple-git/promise')(__dirname).silent(true);

// https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
const formatBytes = (bytes, decimals = 2) => {
	if (bytes === 0) return '0 Bytes';

	const k = 1000;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

	const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const maybePlus = (from, to) => from < to ? "+" : "";

const absDiff = (from, to) => {
	if (from === to) {
		return formatBytes(0);
	}

	return `${maybePlus(from, to)}${formatBytes(to - from)}`;
}

const percDiff =  (from, to) => {
	if (from === to) {
		return '0%';
	}

	return `${maybePlus(from, to)}${
		(100 * (to - from) / (from || to)).toFixed(1)
	}%`;
}

const getSummary = (rows, totalMasterFileSize, totalFileSize) => {
	const numFiles = rows.length;
	const maybeS = rows.length > 0 ? 's' : '';
	const byteDiff = absDiff(totalMasterFileSize, totalFileSize);
	const percentDiff = percDiff(totalMasterFileSize, totalFileSize);

	return `A total of ${numFiles} file${maybeS} have changed, with a combined diff of ${byteDiff} (${percentDiff}).`;
}

const getChangedMinifiedFiles = async () => {
	const result = await git.diff(['--name-only', '--no-renames', 'master...']);

	return result
		? result.split(/\r?\n/g).filter(file => file.endsWith('.min.js'))
		: [];
};

const run = async () => {
	// Check if master exists & check it out if not.
	const result = await git.branch(['--list', 'master']);
	if (result.all.length === 0) {
		await git.branch(['master', 'origin/master']);
	}

	const minified = await getChangedMinifiedFiles();

	if (minified.length === 0) {
		markdown(`## No JS Changes`);
		return;
	}

	const rows = [];
	let totalFileSize = 0;
	let totalMasterFileSize = 0;

	for (const file of minified) {
		const [fileContents, fileMasterContents] = await Promise.all([
			fs.readFile(file, 'utf-8').catch(() => ''),
			git.show([`master:${file}`]).catch(() => ''),
		]);

		const [fileSize, fileMasterSize] = await Promise.all([
			gzipSize(fileContents),
			gzipSize(fileMasterContents),
		]);

		totalFileSize += fileSize;
		totalMasterFileSize +=fileMasterSize

		rows.push([
			file,
			formatBytes(fileMasterSize),
			formatBytes(fileSize),
			absDiff(fileMasterSize, fileSize),
			percDiff(fileMasterSize, fileSize),
		]);
	}

	markdown(`## JS File Size Changes (gzipped)

${getSummary(rows, totalMasterFileSize, totalFileSize)}

<details>

| file | master | pull | size diff | % diff |
| --- | --- | --- | --- | --- |
${rows.map(row => `| ${row.join(' | ')} |`).join('\n')}

</details>
`);
}

run().catch(err => {
	console.error(err);
	process.exit(1);
});
