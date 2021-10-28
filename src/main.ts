import { SESHandler } from 'aws-lambda';
import { simpleParser } from 'mailparser';
import { S3, SES } from 'aws-sdk';
import { Stream } from 'stream';

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(message);
}

const handler: SESHandler = async event => {
  log('E-mail received. Forwarding.');

  const ses = event.Records[0].ses;
  const bucketName = process.env.BIO_AWS_S3_BUCKET!;
  const key = ses.mail.messageId;

  log(`Bucket: ${bucketName}, file: ${key}`);

  const s3Client = new S3({
    region: process.env.BIO_AWS_REGION!,
    apiVersion: 'latest',
  });

  const object = await s3Client.getObject({ Bucket: bucketName, Key: key }).promise();

  if (typeof object.Body !== 'string' && !Buffer.isBuffer(object.Body) && !(object.Body instanceof Stream)) {
    throw new Error('Object body not supported');
  }

  const email = await simpleParser(object.Body);

  const sesClient = new SES({ region: process.env.BIO_AWS_REGION!, apiVersion: 'latest' });

  const html = typeof email.html === 'string' ? email.html : email.textAsHtml;
  await sesClient
    .sendEmail({
      Message: {
        Body: {
          Html: {
            Data: `<p>E-mail from: ${email.from?.value
              .map(from => `${from.name} (${from.address ?? 'No address'})`)
              .join(', ')}</p><br><br>${html}`,
          },
        },
        Subject: { Data: email.subject! },
      },
      Destination: { ToAddresses: [process.env.BIO_MAIL_RECEIPT!] },
      Source: process.env.BIO_MAIL_SENDER!,
    })
    .promise();

  log('E-mail sent!');

  await s3Client.deleteObject({ Bucket: bucketName, Key: key }).promise();

  log('Object deleted from S3');
};

exports.handler = handler;
