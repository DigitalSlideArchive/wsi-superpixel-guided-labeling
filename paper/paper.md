---
title: 'WSI Superpixel Guided Labeling'
tags:
  - Python
  - histology 
  - bioimage informatics 
  - whole slide annotation 
  - whole slide images
  - guided labeling
# (add orcid for anyone who has one)
authors:
  - name: Brianna Major
    affiliation: 1
    orcid: 0000-0003-4968-5701
  - name: Jeffery A. Goldstein
    affiliation: 2
    orcid: 0000-0002-4086-057X
  - name: Michael Nagler
    affiliation: 1
    orcid: 0000-0003-3531-6630
  - name: Lee A. Newberg
    affiliation: 1
    orcid: 0000-0003-4644-8874
  - name: Abhishek Sharma
    affiliation: 2
  - name: Anders Sildnes
    affiliation: 2
  - name: Faiza Ahmed
    affiliation: 1
    orcid: 0000-0001-6687-9941
  - name: Jeff Baumes
    affiliation: 1
    orcid: 0000-0002-4719-3490
  - name: Lee A.D. Cooper
    affiliation: 2
    orcid: 0000-0002-3504-4965
  - name: David Manthey
    affiliation: 1
    orcid: 0000-0002-4580-8770
affiliations:
  - index: 1
    name: Kitware, Inc., New York, United States
  - index: 2
    name: Northwestern University Feinberg School of Medicine, Illinois, United States
date: 30 April 2025
bibliography: paper.bib
---

# Summary

`WSI Superpixel Guided Labeling` facilitates active learning on whole slide images.  It has a user interface built on top of the HistomicsUI [@histomicsui] base and deployed as part of the Digital Slide Archive [@Gutman2017, @digitalslidearchive], and uses the HistomicsTK [@histomicstk] tool kit as part of the process. 

Users label superpixel regions or other segmented areas of whole slide images to be used as classification input for machine learning algorithms.  An example algorithm is included which generates superpixels, features, and machine learning models for active learning on a directory of images.  The interface allows bulk labeling, labeling the most impactful superpixels to improve the model, and reviewing labeled and predicted categories.

# Statement of need

One of the limitations in generating accurate models is the need for labeled data.  Given a model and a few labeled samples, there are a variety of algorithms that can be used to determine what samples should be additionally labeled to most efficiently improve the model.  To actually get labeled data, this prediction of which samples to label needs to be combined with an efficient workflow so that the domain expert can use their labeling time in the most effective manner possible.

`WSI Superpixel Guided Labeling` provides a user interface and workflow for this guided labeling process.  Given a set of whole slide images, the images are segmented based on a some user choices.  This segmentation is the basis for labeling.  The user can specify any number of label categories, including labels that will be excluded from training (for instance, for segmented regions whose categories cannot be accurately determined).  After labeling a few initial segments, a model is generated and used to both predict the category of all segments and the segments that would result in the best improvement in the model if they were also labeled.  The user can retrain the model at any time and review the results of both the predictions and other users.

For development, the initial segmentation uses superpixels generated with the SLIC algorithm.  These are computed on whole slide images in a tiled manner so that they can work on arbitrarily large images, and the tile boundaries are properly handled to avoid visible artifacts.  Either of two basic models can be trained and used for predictions: small-scale CNN using image features implemented in tensorflow/keras or torch, or a huggingface foundation model that generates a one-dimensional feature vector.  The certainty criteria for which segments should be labeled next can also be selected, and includes confidence, margin, negative entropy, and the BatchBALD [@batchbald2019] algorithm.

We had a placental pathologist provide feedback to validate the efficiency of the user interface and utility of the process.

![The Guided Labeling interface showing a row of superpixels to be labeled and part of a whole slide image](../docs/screenshots/active_learning_view.png)

# Acknowledgements

This work has been funded in part by National Library of Medicine grant 5R01LM013523 entitled "Guiding humans to create better labeled datasets for machine learning in biomedical research".

# References
