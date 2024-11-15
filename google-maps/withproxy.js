// This code will extract data like the reviewer name, rating, date of review and review text from the Google Maps page and save it in a CSV file.

const puppeteer = require('puppeteer');
const fs = require('fs');

// Function to create CSV string from reviews
function createCsvString(reviews) {
  const headers = [
    'Reviewer Name',
    'Review Text',
    'Review Date',
    'Star Rating',
  ];
  const csvRows = [headers];

  reviews.forEach((review) => {
    // Clean up review text: remove newlines and commas
    const cleanReviewText = review.reviewText
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .replace(/,/g, ';'); // Replace commas with semicolons

    csvRows.push([
      review.reviewerName || '',
      cleanReviewText || '',
      review.reviewDate || '',
      review.starRating || '',
    ]);
  });

  return csvRows.map((row) => row.join(',')).join('\n');
}

async function autoScroll(page) {
  return page.evaluate(async () => {
    async function getScrollableElement() {
      const selectors = [
        '.DxyBCb [role="main"]',
        '.WNBkOb [role="main"]',
        '.review-dialog-list',
        '.section-layout-root',
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) return element;
      }

      const possibleContainers = document.querySelectorAll('div');
      for (const container of possibleContainers) {
        if (
          container.scrollHeight > container.clientHeight &&
          container.querySelector('.jftiEf.fontBodyMedium')
        ) {
          return container;
        }
      }

      return null;
    }

    const scrollable = await getScrollableElement();
    if (!scrollable) {
      console.error('Could not find scrollable container');
      return 0;
    }

    const getScrollHeight = () => {
      const reviews = document.querySelectorAll('.jftiEf.fontBodyMedium');
      return reviews.length;
    };

    let lastHeight = getScrollHeight();
    let noChangeCount = 0;
    const maxTries = 10;

    while (noChangeCount < maxTries) {
      if (scrollable.scrollTo) {
        scrollable.scrollTo(0, scrollable.scrollHeight);
      } else {
        scrollable.scrollTop = scrollable.scrollHeight;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const newHeight = getScrollHeight();
      if (newHeight === lastHeight) {
        noChangeCount++;
      } else {
        noChangeCount = 0;
        lastHeight = newHeight;
      }
    }

    return lastHeight;
  });
}

(async () => {
  try {
    // replace url with the url of the google maps page you want to scrape
    const url =
      'https://www.google.com/maps/place/Made+In+New+York+Pizza/@40.7838392,-74.0537874,13z/data=!4m13!1m3!2m2!1spizza+in+new+york!6e5!3m8!1s0x89c259ddd4cde22f:0xdc61ba2b00a3adf0!8m2!3d40.7838392!4d-73.9775697!9m1!1b1!15sChFwaXp6YSBpbiBuZXcgeW9ya1oTIhFwaXp6YSBpbiBuZXcgeW9ya5IBEHBpenphX3Jlc3RhdXJhbnTgAQA!16s%2Fg%2F11n8ng0xxw?entry=ttu&g_ep=EgoyMDI0MTExMC4wIKXMDSoASAFQAw%3D%3D';

    const browser = await puppeteer.launch({
      headless: false,
    });

    const page = await browser.newPage();

    // Set proxy authentication

    // This code uses the Bright Data Scraping Browser, but it can work for other proxy providers too, just replace the username, password, host with that of your provider.

    await page.authenticate({
      username: '<replace with your proxy username>',
      password: '<replace with your proxy password>',
      host: '<<replace with your proxy host>',
    });

    await page.setViewport({ width: 1920, height: 1080 });

    console.log('Navigating to page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for reviews to load
    console.log('Waiting for reviews to load...');
    try {
      await page.waitForSelector('.jftiEf.fontBodyMedium', { timeout: 10000 });
    } catch (error) {
      console.error('Could not find any reviews on the page');
      await browser.close();
      return;
    }

    console.log('Starting to scroll for reviews...');
    const totalReviews = await autoScroll(page);
    console.log(`Finished scrolling. Found ${totalReviews} reviews.`);

    const reviews = await page.evaluate(() => {
      const reviewCards = document.querySelectorAll('.jftiEf.fontBodyMedium');
      const reviewData = [];

      reviewCards.forEach((card) => {
        const reviewerName = card.querySelector('.d4r55')?.innerText || null;
        const reviewText =
          card.querySelector('.wiI7pd')?.innerText || 'No review content';
        const reviewDate = card.querySelector('.rsqaWe')?.innerText || null;

        const starRatingElement = card.querySelector('.kvMYJc');
        let starRating = 0;
        if (starRatingElement && starRatingElement.getAttribute('aria-label')) {
          const ratingText = starRatingElement.getAttribute('aria-label');
          const match = ratingText.match(/(\d+)\s+stars/);
          if (match && match[1]) {
            starRating = parseInt(match[1], 10);
          }
        }

        reviewData.push({
          reviewerName,
          reviewText,
          reviewDate,
          starRating,
        });
      });

      return reviewData;
    });

    console.log(`Successfully extracted ${reviews.length} reviews`);

    // Create CSV string
    const csvString = createCsvString(reviews);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `googlemapsreviews_${timestamp}.csv`;

    // Save to file
    fs.writeFileSync(filename, csvString);
    console.log(`Reviews saved to ${filename}`);

    // Also log to console
    console.log('First few reviews:', reviews.slice(0, 3));

    await browser.close();
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();