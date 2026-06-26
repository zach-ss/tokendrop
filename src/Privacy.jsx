export default function Privacy() {
  return (
    <div className="legal-page">
      <div className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="legal-date">Last updated: June 2026</p>

       <h2>Who we are</h2>
        <p>TokenDrop converts PDF files, Word documents, and web page URLs into clean Markdown text. File processing happens locally in your browser. Nothing you upload ever leaves your device.</p>

        <h2>What information we collect</h2>
        <p>TokenDrop itself collects no personal information from you. No account is required to use the tool.</p>
        <p>This website uses Vercel Analytics, a third-party service provided by Vercel Inc. Vercel Analytics collects anonymised, aggregated data about how visitors use the site. This may include your general location (country level), device type, browser type, and pages visited. This data does not identify you personally and is used solely to understand how the site is being used so it can be improved. You can read Vercel's privacy policy at vercel.com/legal/privacy-policy.</p>

        <h2>Your files</h2>
        <p>Files you upload are processed entirely within your browser using client-side libraries. They are never transmitted to any server.</p>
        <p>When you convert a URL, TokenDrop's server fetches the requested page on your behalf in order to bypass browser security restrictions. The content of that page is returned to your browser for conversion and is not stored, logged, or retained by TokenDrop in any way.</p>

        <h2>Cookies</h2>
        <p>TokenDrop does not use cookies. Vercel Analytics may use limited technical identifiers to distinguish unique visits. These are anonymised and do not track you across other websites.</p>

        <h2>Third party links</h2>
        <p>TokenDrop references mammoth.js and pdf.js, both open-source libraries. This policy does not cover third-party websites. If you navigate to an external link from this site, their own privacy practices apply.</p>

        <h2>Children</h2>
        <p>TokenDrop is not directed at children under the age of 15. We do not knowingly collect any information from children.</p>

        <h2>Your rights</h2>
        <p>As TokenDrop collects no personal information about you, there is no personal data for you to access, correct, or delete. If you have questions about data handled by Vercel Analytics, contact Vercel directly.</p>

        <h2>Changes to this policy</h2>
        <p>This policy may be updated from time to time. The date at the top of this page reflects the most recent version. Continued use of the site after any changes constitutes acceptance of the updated policy.</p>
      </div>
    </div>
  )
}
