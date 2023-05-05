const factory = function () {
    /**
     * Just return a value to define the module export.
     * This example returns an object, but the module
     * can return a function as the exported value.
     */
    return function(lunr) {
        /* Set up the pipeline for indexing content in multiple languages. The
           corresponding lunr.{lang} files must be loaded before calling this
           function; English ('en') is built in.

           Returns: a lunr plugin for use in your indexer.

           Known drawback: every word will be stemmed with stemmers for every
           language. This could mean that sometimes words that have the same
           stemming root will not be stemmed as such.
           */
        lunr.multiLanguage = function(/* lang1, lang2, ... */) {
            var languages = Array.prototype.slice.call(arguments);
            var nameSuffix = languages.join('-');
            var wordCharacters = "";
            var pipeline = [];
            for (var i = 0; i < languages.length; ++i) {
                if (languages[i] == 'en') {
                    wordCharacters += '\\w';
                    pipeline.unshift(lunr.stopWordFilter);
                    pipeline.push(lunr.stemmer);
                } else {
                    wordCharacters += lunr[languages[i]].wordCharacters;
                    pipeline.unshift(lunr[languages[i]].stopWordFilter);
                    pipeline.push(lunr[languages[i]].stemmer);
                }
            };
            var multiTrimmer = lunr.trimmerSupport.generateTrimmer(wordCharacters);
            lunr.Pipeline.registerFunction(multiTrimmer, 'lunr-multi-trimmer-' + nameSuffix);
            pipeline.unshift(multiTrimmer);

            return function() {
                this.pipeline.reset();
                this.pipeline.add.apply(this.pipeline, pipeline);
            };
        }
    }
}

export default factory();
