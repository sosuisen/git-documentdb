/*!
 * Lunr languages, `Japanese` language
 * https://github.com/MihaiValentin/lunr-languages
 *
 * Copyright 2014, Chad Liu
 * http://www.mozilla.org/MPL/
 */
/*!
 * based on
 * Snowball JavaScript Library v0.3
 * http://code.google.com/p/urim/
 * http://snowball.tartarus.org/
 *
 * Copyright 2010, Oleg Mazko
 * http://www.mozilla.org/MPL/
 */
import TinySegmenter from './tinyseg.js';
const factory =  function() {
  /**
   * Just return a value to define the module export.
   * This example returns an object, but the module
   * can return a function as the exported value.
   */
  return function(lunr) {
    /* throw error if lunr is not yet included */
    if ('undefined' === typeof lunr) {
      throw new Error('Lunr is not present. Please include / require Lunr before this script.');
    }

    /* throw error if lunr stemmer support is not yet included */
    if ('undefined' === typeof lunr.stemmerSupport) {
      throw new Error('Lunr stemmer support is not present. Please include / require Lunr stemmer support before this script.');
    }

    /*
    Japanese tokenization is trickier, since it does not
    take into account spaces.
    Since the tokenization function is represented different
    internally for each of the Lunr versions, this had to be done
    in order to try to try to pick the best way of doing this based
    on the Lunr version
     */
    var isLunr2 = lunr.version[0] == "2";

    /* register specific locale function */
    lunr.ja = function() {
      this.pipeline.reset();
      this.pipeline.add(
        lunr.ja.trimmer,
        lunr.ja.stopWordFilter,
        lunr.ja.stemmer
      );
      // change the tokenizer for japanese one
      lunr.tokenizer = lunr.ja.tokenizer;
    };
//    var segmenter = new lunr.TinySegmenter();  // インスタンス生成
    var segmenter = new TinySegmenter();

    lunr.ja.tokenizer = function (obj) {
        if (!arguments.length || obj == null || obj == undefined) return []
        if (Array.isArray(obj)) return obj.map(function (t) { return t.toLowerCase() })

        var str = obj.toString().replace(/^\s+/, '')

        for (var i = str.length - 1; i >= 0; i--) {
            if (/\S/.test(str.charAt(i))) {
                str = str.substring(0, i + 1)
                break
            }
        }

                     
        var segs = segmenter.segment(str);  // 単語の配列が返る
        return segs.filter(function (token) {
            return !!token
          })
          .map(function (token) {
            return token
          })
    }

    /* lunr stemmer function */
    lunr.ja.stemmer = (function() {
      
      /* TODO japanese stemmer  */
      return function(word) {
        return word;
      }
    })();

    lunr.Pipeline.registerFunction(lunr.ja.stemmer, 'stemmer-ja');

    /* lunr trimmer function */
    lunr.ja.wordCharacters = "一二三四五六七八九十百千万億兆一-龠々〆ヵヶぁ-んァ-ヴーｱ-ﾝﾞa-zA-Zａ-ｚＡ-Ｚ0-9０-９";
    lunr.ja.trimmer = lunr.trimmerSupport.generateTrimmer(lunr.ja.wordCharacters);
    lunr.Pipeline.registerFunction(lunr.ja.trimmer, 'trimmer-ja');

    /* stop word filter function */
    lunr.ja.stopWordFilter = function(token) {
      if (lunr.ja.stopWordFilter.stopWords.indexOf(token) === -1) {
        return token;
      }
    };

    lunr.ja.stopWordFilter.stopWords = new lunr.SortedSet();
    lunr.ja.stopWordFilter.stopWords.length = 45;

    // The space at the beginning is crucial: It marks the empty string
    // as a stop word. lunr.js crashes during search when documents
    // processed by the pipeline still contain the empty string.
    // stopword for japanese is from http://www.ranks.nl/stopwords/japanese
    lunr.ja.stopWordFilter.stopWords.elements = ' これ それ あれ この その あの ここ そこ あそこ こちら どこ だれ なに なん 何 私 貴方 貴方方 我々 私達 あの人 あのかた 彼女 彼 です あります おります います は が の に を で え から まで より も どの と し それで しかし'.split(' ');
    lunr.Pipeline.registerFunction(lunr.ja.stopWordFilter, 'stopWordFilter-ja');
  };
}

export default factory();
