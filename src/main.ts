import { SESHandler } from 'aws-lambda';
import { simpleParser } from 'mailparser';
import { S3, SES } from 'aws-sdk';

const handler: SESHandler = async event => {
  try {
    const ses = event.Records[0].ses;
    const bucketName = process.env.BIO_AWS_S3_BUCKET!;
    const key = ses.mail.messageId;

    const s3Client = new S3({
      region: process.env.BIO_AWS_REGION!,
      apiVersion: 'latest',
    });

    const object = await s3Client.getObject({ Bucket: bucketName, Key: key }).promise();
    const email = await simpleParser(object.Body as any);

    const sesClient = new SES({ region: process.env.BIO_AWS_REGION!, apiVersion: 'latest' });

    const html = typeof email.html === 'string' ? email.html : email.textAsHtml;
    await sesClient
      .sendEmail(
        {
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
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {}
      )
      .promise();
    await s3Client.deleteObject({ Bucket: bucketName, Key: key }).promise();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
};

exports.handler = handler;